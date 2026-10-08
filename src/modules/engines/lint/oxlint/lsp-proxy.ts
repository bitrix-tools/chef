import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createPathFilter } from '../../../../utils/create-path-filter';
import { TransformationArtifacts } from './artifacts';
import { IGNORED_FILES, findProjectConfig, writePresetConfig } from './oxlint-config';
import { prepareSource } from './prepare-source';
import { oxlintBin } from './run-oxlint';
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
 */
export class OxlintLspProxy
{
	readonly #rootPath: string;
	readonly #documents = new Map<string, OpenDocument>();
	// virtual URI -> real URI
	readonly #realUris = new Map<string, string>();
	// ids of workspace/configuration requests the server sent to the client
	readonly #configurationRequests = new Set<number | string>();
	// ids of textDocument/diagnostic requests the client sent (pull diagnostics) -> real URI
	readonly #diagnosticRequests = new Map<number | string, string>();
	#configPath: string | null = null;
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

		const server = spawn(process.execPath, [oxlintBin(), '--lsp'], { cwd: this.#rootPath, stdio: ['pipe', 'pipe', 'inherit'] });
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
				this.#withConfigPath(message.params);
				break;
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
		if (message.method === undefined && message.id !== undefined && this.#configurationRequests.delete(message.id!))
		{
			if (Array.isArray(message.result))
			{
				message.result = message.result.map((item: unknown) => this.#withOptions(item));
			}
		}

		this.#server.send(this.#toServerUris(message));
	}

	#fromServer(message: Message): void
	{
		if (message.method === 'workspace/configuration' && message.id !== undefined)
		{
			this.#configurationRequests.add(message.id!);
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

	#withConfigPath(params: any): void
	{
		if (!this.#configPath)
		{
			return;
		}

		const options = params.initializationOptions;
		if (Array.isArray(options))
		{
			params.initializationOptions = options.map((entry) => ({ ...entry, options: this.#withOptions(entry?.options) }));
		}
		else
		{
			const workspaceUri = params.rootUri ?? pathToFileURL(this.#rootPath).href;
			params.initializationOptions = [{ workspaceUri, options: this.#withOptions(options) }];
		}
	}

	#withOptions(options: unknown): unknown
	{
		if (!this.#configPath)
		{
			return options;
		}

		return { ...(options && typeof options === 'object' ? options : {}), configPath: this.#configPath };
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
