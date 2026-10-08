import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createPathFilter } from '../../../../utils/create-path-filter';
import { TransformationArtifacts } from './artifacts';
import { oxlintServerArgs } from './lsp-server';
import { IGNORED_FILES, findProjectConfig, writePresetConfig } from './oxlint-config';
import { prepareSource } from './prepare-source';
import { TextPositions } from './text-positions';

import type { PreparedSource } from './prepare-source';

type Message = {
	jsonrpc: '2.0';
	id?: number | string | null;
	method?: string;
	params?: any;
	result?: any;
	error?: unknown;
};

type Position = { line: number; character: number };
type Range = { start: Position; end: Position };
type TextEdit = { range: Range; newText: string };

/**
 * Reads and writes LSP messages (`Content-Length` framed JSON) on a pair of streams.
 */
class MessageStream
{
	#buffer = Buffer.alloc(0);

	constructor(input: NodeJS.ReadableStream, private readonly output: NodeJS.WritableStream, onMessage: (message: Message) => void)
	{
		input.on('data', (chunk: Buffer) => {
			this.#buffer = Buffer.concat([this.#buffer, chunk]);
			for (;;)
			{
				const headerEnd = this.#buffer.indexOf('\r\n\r\n');
				if (headerEnd === -1)
				{
					return;
				}

				const length = Number(/Content-Length: *(\d+)/i.exec(this.#buffer.subarray(0, headerEnd).toString('ascii'))?.[1] ?? 0);
				if (this.#buffer.length < headerEnd + 4 + length)
				{
					return;
				}

				const body = this.#buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString('utf8');
				this.#buffer = this.#buffer.subarray(headerEnd + 4 + length);
				onMessage(JSON.parse(body));
			}
		});
	}

	send(message: Message): void
	{
		const body = JSON.stringify(message);
		this.output.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
	}
}

/**
 * A directory the server lints as a workspace of its own: the extension of the open file.
 */
type Scope = {
	dir: string;
	uri: string;
	// the editor workspace folder it lies in
	rootDir: string;
	ready: boolean;
	// client messages about its documents, held until the server has a worker for it
	queue: Message[];
	timer: NodeJS.Timeout | null;
};

// how long messages wait for a scope when the server never confirms it
const SCOPE_TIMEOUT = 60_000;

const EXTENSION_FILES = ['bundle.config.js', 'bundle.config.ts', 'script.es6.js'];

type OpenDocument = {
	// what the server sees
	uri: string;
	prepared: PreparedSource;
	text: string;
	// null for documents the server sees as they are
	artifacts: TransformationArtifacts | null;
};

/**
 * Language server for editors: `oxlint --lsp` behind a proxy that lets it lint Flow files.
 *
 * Flow documents are handed to oxlint the way `chef lint` does it (see prepare-source.ts),
 * under a virtual `*.js.ts` URI when they are linted as TypeScript. Diagnostics and edits
 * coming back are moved to the real URI; transformations keep every position, so ranges
 * need no mapping, only the ones that describe the transformation itself are dropped.
 * Without a project oxlint config the server gets the Bitrix24 presets.
 *
 * The server does not get the editor's workspace folders: on start it walks a workspace
 * looking for .gitignore files, which takes minutes on a repository of modules and times
 * out the editor. Each extension with an open document becomes a workspace instead, and
 * messages about its documents wait until the server confirms it (it registers file
 * watchers for a new workspace). The config path is passed explicitly, since the server
 * looks for a config in the workspace only: the one set in the editor, else the nearest
 * project config, else the presets.
 */
export class OxlintLspProxy
{
	readonly #rootPath: string;
	readonly #documents = new Map<string, OpenDocument>();
	// virtual URI -> real URI
	readonly #realUris = new Map<string, string>();
	// ids of workspace/configuration requests the server sent to the client -> scopes asked for
	readonly #configurationRequests = new Map<number | string, Array<Scope | null>>();
	// ids of textDocument/diagnostic requests the client sent (pull diagnostics) -> real URI
	readonly #diagnosticRequests = new Map<number | string, string>();
	#configPath: string | null = null;
	// editor workspace folders and the options the editor gave for them, by folder path
	#rootDirs: string[] = [];
	readonly #rootOptions = new Map<string, unknown>();
	#clientConfiguration = false;
	#clientWatchers = false;
	readonly #scopes = new Map<string, Scope>();
	// directory of a document -> directory of its scope
	readonly #scopeDirs = new Map<string, string>();
	readonly #isIgnored = createPathFilter(IGNORED_FILES);
	#client!: MessageStream;
	#server!: MessageStream;

	constructor(rootPath: string)
	{
		this.#rootPath = rootPath;
	}

	async start(): Promise<void>
	{
		if (!findProjectConfig(this.#rootPath, this.#rootPath))
		{
			const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'chef-oxlint-lsp-'));
			this.#configPath = await writePresetConfig({ outputDir: tempDir, sourceRepository: true });
			process.on('exit', () => fs.rmSync(tempDir, { recursive: true, force: true }));
		}

		const server = spawn(process.execPath, oxlintServerArgs(), { cwd: this.#rootPath, stdio: ['pipe', 'pipe', 'inherit'] });
		server.on('exit', (code) => process.exit(code ?? 0));
		process.stdin.on('end', () => server.kill());

		this.#server = new MessageStream(server.stdout, server.stdin, (message) => this.#fromServer(message));
		this.#client = new MessageStream(process.stdin, process.stdout, (message) => this.#fromClient(message));
	}

	#fromClient(message: Message): void
	{
		switch (message.method)
		{
			case 'initialize':
				this.#initialize(message.params);
				break;
			case 'workspace/didChangeWorkspaceFolders':
				this.#changeRoots(message.params.event);

				return;
			case 'workspace/didChangeConfiguration':
				this.#changeConfiguration(message.params);
				break;
			default:
				break;
		}

		const scope = this.#scopeOfMessage(message);
		if (scope && !scope.ready)
		{
			scope.queue.push(message);

			return;
		}

		this.#handleClient(message);
	}

	#handleClient(message: Message): void
	{
		switch (message.method)
		{
			case 'textDocument/didOpen':
				this.#open(message.params.textDocument.uri, message.params.textDocument.text, message.params.textDocument.version);

				return;
			case 'textDocument/didChange':
				this.#change(message.params.textDocument.uri, message.params.contentChanges, message.params.textDocument.version);

				return;
			case 'textDocument/didClose':
				this.#close(message.params.textDocument.uri);

				return;
			case 'textDocument/diagnostic':
				if (message.id !== undefined && message.id !== null)
				{
					this.#diagnosticRequests.set(message.id, message.params.textDocument.uri);
				}
				break;
			case 'textDocument/didSave':
				// the server may read a saved file from disk, but a virtual document has no file
				if (this.#isTransformed(message.params.textDocument.uri))
				{
					return;
				}
				break;
			default:
				break;
		}

		// a response to the server's workspace/configuration request
		const scopes = message.method === undefined && message.id !== undefined && message.id !== null
			? this.#configurationRequests.get(message.id)
			: undefined;
		if (scopes)
		{
			this.#configurationRequests.delete(message.id!);
			if (Array.isArray(message.result))
			{
				message.result = message.result.map((item: unknown, index: number) => {
					const scope = scopes[index] ?? null;

					return this.#withOptions(scope ? this.#merge(this.#rootOptions.get(scope.rootDir), item) : item, scope);
				});
			}
		}

		this.#server.send(this.#toServerUris(message));
	}

	#fromServer(message: Message): void
	{
		if (message.method === 'workspace/configuration' && message.id !== undefined && message.id !== null)
		{
			this.#requestConfiguration(message);

			return;
		}

		if (message.method === 'client/registerCapability' || message.method === 'client/unregisterCapability')
		{
			if (message.method === 'client/registerCapability')
			{
				this.#confirmScopes(message.params?.registrations ?? []);
			}

			// the server is told the editor watches files, to learn when a scope is ready
			if (!this.#clientWatchers)
			{
				this.#server.send({ jsonrpc: '2.0', id: message.id, result: null });

				return;
			}
		}

		if (message.method === 'textDocument/publishDiagnostics')
		{
			const realUri = this.#realUris.get(message.params.uri) ?? message.params.uri;
			message.params.uri = realUri;
			message.params.diagnostics = this.#withoutArtifacts(realUri, message.params.diagnostics);
		}

		// a response to the client's textDocument/diagnostic request: clients that pull
		// diagnostics (the JetBrains plugin does) get them here instead of publishDiagnostics
		if (message.method === undefined && message.id !== undefined && message.id !== null && this.#diagnosticRequests.has(message.id))
		{
			const realUri = this.#diagnosticRequests.get(message.id)!;
			this.#diagnosticRequests.delete(message.id);
			if (Array.isArray(message.result?.items))
			{
				message.result.items = this.#withoutArtifacts(realUri, message.result.items);
			}
		}

		this.#client.send(this.#toClientUris(message));
	}

	#withoutArtifacts<T extends { range: Range; code?: string }>(realUri: string, diagnostics: T[]): T[]
	{
		if (this.#isIgnoredUri(realUri))
		{
			return [];
		}

		const document = this.#documents.get(realUri);
		if (!document)
		{
			return diagnostics;
		}

		return diagnostics.filter((d) => !this.#isArtifact(document, d.range, d.code));
	}

	/**
	 * Files `chef lint` never lints, though editors send them (the JetBrains plugin sends .cjs).
	 */
	#isIgnoredUri(uri: string): boolean
	{
		return uri.startsWith('file:') && this.#isIgnored(path.relative(this.#rootPath, fileURLToPath(uri)));
	}

	#initialize(params: any): void
	{
		const folders: Array<{ uri: string }> = Array.isArray(params.workspaceFolders) ? params.workspaceFolders : [];
		const rootUris = folders.length > 0
			? folders.map((folder) => folder.uri)
			: [params.rootUri ?? (params.rootPath ? pathToFileURL(params.rootPath).href : pathToFileURL(this.#rootPath).href)];
		this.#rootDirs = rootUris.filter((uri) => uri.startsWith('file:')).map((uri) => fileURLToPath(uri));

		const options = params.initializationOptions;
		for (const rootDir of this.#rootDirs)
		{
			const entry = Array.isArray(options)
				? options.find((item) => typeof item?.workspaceUri === 'string' && this.#isSamePath(item.workspaceUri, rootDir))
				: undefined;
			// the old form: settings for the only folder
			const given = Array.isArray(options) ? entry?.options : options?.settings;
			this.#rootOptions.set(rootDir, given ?? null);
		}

		const capabilities = params.capabilities ?? {};
		const workspace = capabilities.workspace ?? {};
		this.#clientConfiguration = workspace.configuration === true;
		this.#clientWatchers = workspace.didChangeWatchedFiles?.dynamicRegistration === true;

		params.capabilities = {
			...capabilities,
			workspace: {
				...workspace,
				configuration: true,
				didChangeWatchedFiles: { ...workspace.didChangeWatchedFiles, dynamicRegistration: true },
			},
		};
		// no workers on start: scopes are added as documents open
		params.workspaceFolders = [];
		params.rootUri = null;
		params.rootPath = null;
		params.initializationOptions = [];
	}

	#changeRoots(event: { added?: Array<{ uri: string }>; removed?: Array<{ uri: string }> }): void
	{
		const removed = (event.removed ?? []).map((folder) => fileURLToPath(folder.uri));
		const added = (event.added ?? []).map((folder) => fileURLToPath(folder.uri));
		this.#rootDirs = [...this.#rootDirs.filter((dir) => !removed.includes(dir)), ...added];
		removed.forEach((dir) => this.#rootOptions.delete(dir));
		added.forEach((dir) => this.#rootOptions.set(dir, null));

		const gone = [...this.#scopes.values()].filter((scope) => this.#rootOf(scope.dir) !== scope.rootDir);
		gone.forEach((scope) => this.#dropScope(scope));
		if (gone.length > 0)
		{
			this.#server.send({
				jsonrpc: '2.0',
				method: 'workspace/didChangeWorkspaceFolders',
				params: { event: { added: [], removed: gone.map((scope) => ({ uri: scope.uri, name: scope.dir })) } },
			});
		}
	}

	/**
	 * Options the editor sends per workspace folder go to every scope in that folder.
	 */
	#changeConfiguration(params: any): void
	{
		const settings = params?.settings;
		if (settings === null || settings === undefined)
		{
			// the server asks for the configuration of its scopes
			return;
		}

		if (Array.isArray(settings))
		{
			for (const entry of settings)
			{
				const rootDir = typeof entry?.workspaceUri === 'string'
					? this.#rootDirs.find((dir) => this.#isSamePath(entry.workspaceUri, dir))
					: undefined;
				if (rootDir)
				{
					this.#rootOptions.set(rootDir, entry.options ?? null);
				}
			}
		}
		else
		{
			this.#rootDirs.forEach((dir) => this.#rootOptions.set(dir, settings));
		}

		params.settings = [...this.#scopes.values()].map((scope) => ({
			workspaceUri: scope.uri,
			options: this.#withOptions(this.#rootOptions.get(scope.rootDir) ?? null, scope),
		}));
	}

	/**
	 * The server asks for the options of its workspaces, the scopes: the editor knows only
	 * its own folders, so it is asked for those, or answered here when it cannot be asked.
	 */
	#requestConfiguration(message: Message): void
	{
		const items: Array<{ scopeUri?: string; section?: string }> = message.params?.items ?? [];
		const scopes = items.map((item) => (item.scopeUri ? this.#scopes.get(this.#dirOfUri(item.scopeUri)) ?? null : null));

		if (!this.#clientConfiguration)
		{
			const result = scopes.map((scope) => this.#withOptions(scope ? this.#rootOptions.get(scope.rootDir) ?? null : null, scope));
			this.#server.send({ jsonrpc: '2.0', id: message.id, result });

			return;
		}

		this.#configurationRequests.set(message.id!, scopes);
		message.params.items = items.map((item, index) => {
			const scope = scopes[index];

			return scope ? { ...item, scopeUri: pathToFileURL(scope.rootDir).href } : item;
		});
		this.#client.send(message);
	}

	/**
	 * The scope of a document message, opened on the server when it is the first one.
	 */
	#scopeOfMessage(message: Message): Scope | null
	{
		const uri = message.method?.startsWith('textDocument/') ? message.params?.textDocument?.uri : undefined;
		if (typeof uri !== 'string' || !uri.startsWith('file:'))
		{
			return null;
		}

		const filePath = fileURLToPath(uri);
		const rootDir = this.#rootOf(filePath);
		if (!rootDir)
		{
			return null;
		}

		const dir = this.#scopeDirOf(path.dirname(filePath), rootDir);
		const existing = this.#scopes.get(dir);
		if (existing)
		{
			return existing;
		}

		const scope: Scope = { dir, uri: pathToFileURL(dir).href, rootDir, ready: false, queue: [], timer: null };
		scope.timer = setTimeout(() => this.#release(scope), SCOPE_TIMEOUT);
		scope.timer.unref();
		this.#scopes.set(dir, scope);
		this.#server.send({
			jsonrpc: '2.0',
			method: 'workspace/didChangeWorkspaceFolders',
			params: { event: { added: [{ uri: scope.uri, name: path.basename(dir) }], removed: [] } },
		});

		return scope;
	}

	/**
	 * The extension directory of a document, else its package, else its own directory.
	 */
	#scopeDirOf(fileDir: string, rootDir: string): string
	{
		const known = this.#scopeDirs.get(fileDir);
		if (known)
		{
			return known;
		}

		const ancestors: string[] = [];
		for (let dir = fileDir; ; dir = path.dirname(dir))
		{
			ancestors.push(dir);
			if (dir === rootDir || path.dirname(dir) === dir)
			{
				break;
			}
		}

		const scopeDir = ancestors.find((dir) => EXTENSION_FILES.some((name) => fs.existsSync(path.join(dir, name))))
			?? ancestors.find((dir) => dir !== rootDir && fs.existsSync(path.join(dir, 'package.json')))
			?? fileDir;
		this.#scopeDirs.set(fileDir, scopeDir);

		return scopeDir;
	}

	#confirmScopes(registrations: Array<{ id?: string }>): void
	{
		for (const registration of registrations)
		{
			const id = registration?.id ?? '';
			if (!id.startsWith('watcher-file:'))
			{
				continue;
			}

			const scope = this.#scopes.get(this.#dirOfUri(id.slice('watcher-'.length)));
			if (scope)
			{
				this.#release(scope);
			}
		}
	}

	#release(scope: Scope): void
	{
		if (scope.timer)
		{
			clearTimeout(scope.timer);
			scope.timer = null;
		}

		scope.ready = true;
		const queue = scope.queue;
		scope.queue = [];
		queue.forEach((message) => this.#handleClient(message));
	}

	#dropScope(scope: Scope): void
	{
		if (scope.timer)
		{
			clearTimeout(scope.timer);
		}

		this.#scopes.delete(scope.dir);
		for (const [fileDir, scopeDir] of this.#scopeDirs)
		{
			if (scopeDir === scope.dir)
			{
				this.#scopeDirs.delete(fileDir);
			}
		}
	}

	#rootOf(filePath: string): string | null
	{
		return this.#rootDirs
			.filter((dir) => filePath === dir || filePath.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep))
			.sort((a, b) => b.length - a.length)[0] ?? null;
	}

	#dirOfUri(uri: string): string
	{
		return path.resolve(fileURLToPath(uri));
	}

	#isSamePath(uri: string, dir: string): boolean
	{
		return uri.startsWith('file:') && this.#dirOfUri(uri) === path.resolve(dir);
	}

	/**
	 * Options the editor gave on start, updated by the ones it answers with now.
	 */
	#merge(initial: unknown, current: unknown): unknown
	{
		const isObject = (value: unknown) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
		if (!isObject(initial))
		{
			return current;
		}

		return isObject(current) ? { ...initial as object, ...current as object } : initial;
	}

	/**
	 * The options of a scope: the config path set in the editor wins, relative to the editor
	 * folder; else the nearest project config up to that folder; else the presets.
	 */
	#withOptions(options: unknown, scope: Scope | null): unknown
	{
		const given = options && typeof options === 'object' ? options as Record<string, unknown> : {};
		if (typeof given.configPath === 'string' && given.configPath !== '')
		{
			return scope && !path.isAbsolute(given.configPath)
				? { ...given, configPath: path.resolve(scope.rootDir, given.configPath) }
				: options;
		}

		const configPath = (scope && findProjectConfig(scope.dir, scope.rootDir)) ?? this.#configPath;
		if (!configPath)
		{
			return options;
		}

		return { ...given, configPath };
	}

	#isTransformed(uri: string): boolean
	{
		const document = this.#documents.get(uri);

		return Boolean(document && document.prepared.kind !== 'native' && document.prepared.kind !== 'unparsable');
	}

	#prepare(uri: string, text: string): OpenDocument
	{
		if (!uri.startsWith('file:'))
		{
			return { uri, prepared: { kind: 'native' }, text, artifacts: null };
		}

		const prepared = prepareSource(fileURLToPath(uri), text);
		if (prepared.kind === 'native' || prepared.kind === 'unparsable')
		{
			return { uri, prepared, text, artifacts: null };
		}

		return {
			uri: prepared.kind === 'flow-as-ts' ? `${uri}.ts` : uri,
			prepared,
			text: prepared.text,
			artifacts: new TransformationArtifacts(text, prepared),
		};
	}

	#open(uri: string, text: string, version: number): void
	{
		const document = this.#prepare(uri, text);
		this.#documents.set(uri, document);
		this.#realUris.set(document.uri, uri);
		this.#server.send({
			jsonrpc: '2.0',
			method: 'textDocument/didOpen',
			params: {
				textDocument: {
					uri: document.uri,
					languageId: document.uri.endsWith('.ts') ? 'typescript' : 'javascript',
					version,
					text: document.text,
				},
			},
		});
	}

	#change(uri: string, changes: Array<{ text: string; range?: Range }>, version: number): void
	{
		const previous = this.#documents.get(uri);
		const full = changes.at(-1);
		if (!previous || !full || full.range)
		{
			// incremental changes are not requested (the server asks for full sync)
			return;
		}

		const document = this.#prepare(uri, full.text);
		if (document.uri !== previous.uri)
		{
			this.#close(uri);
			this.#open(uri, full.text, version);

			return;
		}

		this.#documents.set(uri, document);
		this.#server.send({
			jsonrpc: '2.0',
			method: 'textDocument/didChange',
			params: { textDocument: { uri: document.uri, version }, contentChanges: [{ text: document.text }] },
		});
	}

	#close(uri: string): void
	{
		const document = this.#documents.get(uri);
		this.#documents.delete(uri);
		if (document)
		{
			this.#realUris.delete(document.uri);
		}

		this.#server.send({
			jsonrpc: '2.0',
			method: 'textDocument/didClose',
			params: { textDocument: { uri: document?.uri ?? uri } },
		});
	}

	/**
	 * Diagnostics that describe the transformation, and formatting inside Flow types: the
	 * same filter `chef lint` applies.
	 */
	#isArtifact(document: OpenDocument, range: Range, code: string | undefined): boolean
	{
		if (!document.artifacts)
		{
			return false;
		}

		const positions = new TextPositions(document.text);
		const start = positions.indexOfLocation(range.start.line + 1, range.start.character + 1);
		const end = positions.indexOfLocation(range.end.line + 1, range.end.character + 1);

		return document.artifacts.has(code, start, end);
	}

	#isUnsafeEdit(document: OpenDocument, edit: TextEdit): boolean
	{
		const prepared = document.prepared;
		if (prepared.kind === 'native' || prepared.kind === 'unparsable')
		{
			return false;
		}

		// type-stripped documents are never fixed: blanked types make fixes unsafe
		if (prepared.kind === 'stripped')
		{
			return true;
		}

		const positions = new TextPositions(document.text);
		const start = positions.indexOfLocation(edit.range.start.line + 1, edit.range.start.character + 1);
		const end = positions.indexOfLocation(edit.range.end.line + 1, edit.range.end.character + 1);

		return prepared.changed.some((index) => index >= start && index < end)
			|| (prepared.kind === 'flow-as-ts' && prepared.typeRanges.some(([from, to]) => start >= from && end <= to));
	}

	/**
	 * Client -> server: real URIs of transformed documents become their virtual ones.
	 */
	#toServerUris(message: Message): Message
	{
		return this.#mapUris(message, (uri) => this.#documents.get(uri)?.uri ?? uri);
	}

	/**
	 * Server -> client: virtual URIs become real ones, and edits that cannot be applied to
	 * the original are dropped.
	 */
	#toClientUris(message: Message): Message
	{
		const mapped = this.#mapUris(message, (uri) => this.#realUris.get(uri) ?? uri);
		this.#filterEdits(mapped);

		return mapped;
	}

	#mapUris(message: Message, mapUri: (uri: string) => string): Message
	{
		const visit = (value: any): any => {
			if (Array.isArray(value))
			{
				return value.map(visit);
			}

			if (!value || typeof value !== 'object')
			{
				return value;
			}

			const result: Record<string, unknown> = {};
			for (const [key, item] of Object.entries(value))
			{
				if (key === 'uri' && typeof item === 'string')
				{
					result[key] = mapUri(item);
				}
				else if (key === 'changes' && item && typeof item === 'object' && !Array.isArray(item))
				{
					result[key] = Object.fromEntries(Object.entries(item).map(([uri, edits]) => [mapUri(uri), visit(edits)]));
				}
				else
				{
					result[key] = visit(item);
				}
			}

			return result;
		};

		return visit(message);
	}

	#filterEdits(value: any): void
	{
		if (Array.isArray(value))
		{
			value.forEach((item) => this.#filterEdits(item));

			return;
		}

		if (!value || typeof value !== 'object')
		{
			return;
		}

		if (value.changes && typeof value.changes === 'object')
		{
			for (const [uri, edits] of Object.entries(value.changes as Record<string, TextEdit[]>))
			{
				const document = this.#documents.get(uri);
				if (this.#isIgnoredUri(uri))
				{
					value.changes[uri] = [];
				}
				else if (document)
				{
					value.changes[uri] = edits.filter((edit) => !this.#isUnsafeEdit(document, edit));
				}
			}
		}

		if (Array.isArray(value.documentChanges))
		{
			for (const change of value.documentChanges)
			{
				const uri = change?.textDocument?.uri;
				const document = uri && this.#documents.get(uri);
				if (uri && this.#isIgnoredUri(uri) && Array.isArray(change.edits))
				{
					change.edits = [];
				}
				else if (document && Array.isArray(change.edits))
				{
					change.edits = change.edits.filter((edit: TextEdit) => !this.#isUnsafeEdit(document, edit));
				}
			}
		}

		for (const item of Object.values(value))
		{
			this.#filterEdits(item);
		}
	}
}
