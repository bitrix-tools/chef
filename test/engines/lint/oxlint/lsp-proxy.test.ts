import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, it, before, after } from 'mocha';
import { assert } from 'chai';

type Message = { id?: number; method?: string; params?: any; result?: any; error?: any };

/**
 * Talks LSP to `chef-oxlint --lsp` over stdio.
 */
class Client
{
	readonly #process;
	#buffer = Buffer.alloc(0);
	#nextId = 1;
	readonly #waiting = new Map<number, (message: Message) => void>();
	readonly diagnostics = new Map<string, Array<{ code: string; range: any; message: string }>>();
	readonly registrations: Array<{ id: string }> = [];
	// answer workspace/configuration with an error, like an editor that cannot
	configurationFails = false;

	constructor(cwd: string)
	{
		const bin = path.resolve('bin', 'chef-oxlint');
		this.#process = spawn(process.execPath, [bin, '--lsp'], { cwd, stdio: ['pipe', 'pipe', 'ignore'] });
		this.#process.stdout.on('data', (chunk: Buffer) => this.#receive(chunk));
	}

	#receive(chunk: Buffer): void
	{
		this.#buffer = Buffer.concat([this.#buffer, chunk]);
		for (;;)
		{
			const headerEnd = this.#buffer.indexOf('\r\n\r\n');
			if (headerEnd === -1)
			{
				return;
			}

			const length = Number(/Content-Length: (\d+)/.exec(this.#buffer.subarray(0, headerEnd).toString())![1]);
			if (this.#buffer.length < headerEnd + 4 + length)
			{
				return;
			}

			const message: Message = JSON.parse(this.#buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString());
			this.#buffer = this.#buffer.subarray(headerEnd + 4 + length);

			if (message.method === 'textDocument/publishDiagnostics')
			{
				this.diagnostics.set(message.params.uri, message.params.diagnostics);
			}
			else if (message.method && message.id !== undefined)
			{
				if (message.method === 'client/registerCapability')
				{
					this.registrations.push(...message.params.registrations);
				}

				if (message.method === 'workspace/configuration' && this.configurationFails)
				{
					this.send({ id: message.id, error: { code: -32601, message: 'Unhandled method workspace/configuration' } });
				}
				else
				{
					this.send({ id: message.id, result: message.method === 'workspace/configuration' ? message.params.items.map(() => ({})) : null });
				}
			}
			else if (message.id !== undefined)
			{
				this.#waiting.get(message.id)?.(message);
			}
		}
	}

	send(message: Message): void
	{
		const body = JSON.stringify({ jsonrpc: '2.0', ...message });
		this.#process.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
	}

	request(method: string, params: unknown): Promise<Message>
	{
		const id = this.#nextId++;

		return new Promise((resolve) => {
			this.#waiting.set(id, resolve);
			this.send({ id, method, params });
		});
	}

	async waitForDiagnostics(uri: string): Promise<Array<{ code: string; range: any; message: string }>>
	{
		for (let i = 0; i < 400 && !this.diagnostics.has(uri); i++)
		{
			await new Promise((resolve) => setTimeout(resolve, 25));
		}

		return this.diagnostics.get(uri) ?? [];
	}

	stop(): void
	{
		this.#process.kill();
	}
}

function applyEdits(text: string, edits: Array<{ range: any; newText: string }>): string
{
	const lines = text.split('\n');
	const offset = (position: { line: number; character: number }) => {
		return lines.slice(0, position.line).reduce((sum, line) => sum + line.length + 1, 0) + position.character;
	};

	return [...edits]
		.sort((a, b) => offset(b.range.start) - offset(a.range.start))
		.reduce((result, edit) => result.slice(0, offset(edit.range.start)) + edit.newText + result.slice(offset(edit.range.end)), text);
}

describe('oxlint language server', function ()
{
	this.timeout(60000);

	// the server lints documents of its workspace only, by canonical path
	const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-oxlint-lsp-test-')));
	const filePath = path.join(root, 'ext', 'src', 'wrap.js');
	const uri = pathToFileURL(filePath).href;
	const text = "export function wrap(value: ?string): ?string\n{\n\treturn value ? value : \"\"\n}\n";
	let client: Client;

	before(async () => {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, text);
		client = new Client(root);
		await client.request('initialize', {
			processId: process.pid,
			rootUri: pathToFileURL(root).href,
			capabilities: { workspace: { configuration: true } },
		});
		client.send({ method: 'initialized', params: {} });
	});

	after(() => {
		client.stop();
		fs.rmSync(root, { recursive: true, force: true });
	});

	it('lints a Flow document and reports it under its own URI', async () => {
		client.send({ method: 'textDocument/didOpen', params: { textDocument: { uri, languageId: 'javascript', version: 1, text } } });
		const diagnostics = await client.waitForDiagnostics(uri);
		const codes = diagnostics.map((d) => d.code);

		assert.include(codes, '@stylistic(semi)');
		assert.include(codes, '@stylistic(quotes)');
		// `value:  string` after the `?` is blanked is not reported
		assert.notInclude(codes, '@stylistic(no-multi-spaces)');
		assert.isFalse([...client.diagnostics.keys()].some((key) => key.endsWith('.js.ts')));
	});

	it('offers fixes for the real document', async () => {
		const semi = (await client.waitForDiagnostics(uri)).find((d) => d.code === '@stylistic(semi)')!;
		const response = await client.request('textDocument/codeAction', {
			textDocument: { uri },
			range: semi.range,
			context: { diagnostics: [semi] },
		});
		const fix = (response.result as any[]).find((action) => action.edit?.changes);

		assert.deepEqual(Object.keys(fix.edit.changes), [uri]);
	});
});

describe('oxlint language server with pull diagnostics', function ()
{
	this.timeout(60000);

	const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-oxlint-lsp-test-')));
	const filePath = path.join(root, 'ext', 'src', 'wrap.js');
	const uri = pathToFileURL(filePath).href;
	const text = "export function wrap(value: ?string): ?string\n{\n\treturn value ? value : \"\"\n}\n";
	let client: Client;

	before(async () => {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, text);
		client = new Client(root);
		// what the JetBrains Oxc plugin declares: the server then serves textDocument/diagnostic
		await client.request('initialize', {
			processId: process.pid,
			rootUri: pathToFileURL(root).href,
			capabilities: {
				workspace: { configuration: true, diagnostics: { refreshSupport: true } },
				textDocument: { diagnostic: { dynamicRegistration: true } },
			},
		});
		client.send({ method: 'initialized', params: {} });
	});

	after(() => {
		client.stop();
		fs.rmSync(root, { recursive: true, force: true });
	});

	it('answers a diagnostic request for a Flow document without transformation artifacts', async () => {
		client.send({ method: 'textDocument/didOpen', params: { textDocument: { uri, languageId: 'javascript', version: 1, text } } });
		const response = await client.request('textDocument/diagnostic', { textDocument: { uri } });
		const codes = (response.result.items as Array<{ code: string }>).map((d) => d.code);

		assert.include(codes, '@stylistic(semi)');
		assert.include(codes, '@stylistic(quotes)');
		assert.notInclude(codes, '@stylistic(no-multi-spaces)');
	});

	it('fixes all problems of a Flow document and keeps its types', async () => {
		// one request applies non-overlapping fixes only: the quotes, then the semicolon
		let fixed = text;
		for (let version = 2; version <= 3; version++)
		{
			await client.request('textDocument/diagnostic', { textDocument: { uri } });
			const response = await client.request('textDocument/codeAction', {
				textDocument: { uri },
				range: { start: { line: 0, character: 0 }, end: { line: 4, character: 0 } },
				context: { diagnostics: [], only: ['source.fixAll.oxc'] },
			});
			fixed = applyEdits(fixed, (response.result as any[]).flatMap((action) => action.edit?.changes?.[uri] ?? []));
			client.send({ method: 'textDocument/didChange', params: { textDocument: { uri, version }, contentChanges: [{ text: fixed }] } });
		}

		assert.equal(fixed, "export function wrap(value: ?string): ?string\n{\n\treturn value ? value : '';\n}\n");
	});

	it('reports nothing for files chef lint never lints', async () => {
		const cjsUri = pathToFileURL(path.join(root, 'ext', 'build.cjs')).href;
		client.send({ method: 'textDocument/didOpen', params: { textDocument: { uri: cjsUri, languageId: 'javascript', version: 1, text: 'module.exports = "x"\n' } } });
		const response = await client.request('textDocument/diagnostic', { textDocument: { uri: cjsUri } });

		assert.deepEqual(response.result.items, []);
	});
});

describe('oxlint language server with a config path set in the editor', function ()
{
	this.timeout(60000);

	const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-oxlint-lsp-test-')));
	const configPath = path.join(root, 'custom', 'oxlintrc.json');
	const filePath = path.join(root, 'ext', 'src', 'wrap.js');
	const uri = pathToFileURL(filePath).href;
	const text = 'export function wrap(value) { debugger; return value ? value : "" }\n';
	let client: Client;

	before(async () => {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.mkdirSync(path.dirname(configPath), { recursive: true });
		fs.writeFileSync(filePath, text);
		fs.writeFileSync(configPath, JSON.stringify({ categories: { correctness: 'off' }, rules: { 'no-debugger': 'error' } }));
		client = new Client(root);
		await client.request('initialize', {
			processId: process.pid,
			rootUri: pathToFileURL(root).href,
			capabilities: {
				workspace: { configuration: true, diagnostics: { refreshSupport: true } },
				textDocument: { diagnostic: { dynamicRegistration: true } },
			},
			initializationOptions: [{ workspaceUri: pathToFileURL(root).href, options: { configPath } }],
		});
		client.send({ method: 'initialized', params: {} });
	});

	after(() => {
		client.stop();
		fs.rmSync(root, { recursive: true, force: true });
	});

	it('lints with that config instead of the presets', async () => {
		client.send({ method: 'textDocument/didOpen', params: { textDocument: { uri, languageId: 'javascript', version: 1, text } } });
		const response = await client.request('textDocument/diagnostic', { textDocument: { uri } });
		const codes = (response.result.items as Array<{ code: string }>).map((d) => d.code);

		assert.deepEqual(codes, ['eslint(no-debugger)']);
	});
});

describe('oxlint language server in a repository of extensions', function ()
{
	this.timeout(60000);

	const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-oxlint-lsp-test-')));
	const extensionDir = path.join(root, 'ui', 'install', 'js', 'ui', 'wrap');
	const filePath = path.join(extensionDir, 'src', 'lib', 'wrap.js');
	const uri = pathToFileURL(filePath).href;
	const text = 'export function wrap(value) { debugger; return value ? value : "" }\n';
	const watcherOf = (dir: string) => `watcher-${pathToFileURL(dir).href}`;
	let client: Client;

	const open = (filePathToOpen: string, textToOpen: string) => {
		const documentUri = pathToFileURL(filePathToOpen).href;
		client.send({ method: 'textDocument/didOpen', params: { textDocument: { uri: documentUri, languageId: 'javascript', version: 1, text: textToOpen } } });

		return client.request('textDocument/diagnostic', { textDocument: { uri: documentUri } });
	};

	before(async () => {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(path.join(extensionDir, 'bundle.config.js'), 'module.exports = {};\n');
		fs.writeFileSync(filePath, text);
		fs.writeFileSync(path.join(root, '.oxlintrc.json'), JSON.stringify({ categories: { correctness: 'off' }, rules: { 'no-debugger': 'error' } }));
		// chef lint does not apply it: it takes the config found from src up
		fs.writeFileSync(path.join(path.dirname(filePath), '.oxlintrc.json'), JSON.stringify({ rules: { 'no-debugger': 'off' } }));
		fs.writeFileSync(path.join(root, 'package.json'), '{}\n');
		client = new Client(root);
		await client.request('initialize', {
			processId: process.pid,
			// some editors end a folder URI with a slash
			workspaceFolders: [{ uri: `${pathToFileURL(root).href}/`, name: 'root' }],
			capabilities: {
				workspace: { configuration: true, didChangeWatchedFiles: { dynamicRegistration: true }, diagnostics: { refreshSupport: true } },
				textDocument: { diagnostic: { dynamicRegistration: true } },
			},
		});
		client.send({ method: 'initialized', params: {} });
	});

	after(() => {
		client.stop();
		fs.rmSync(root, { recursive: true, force: true });
	});

	it('serves the extension of a document as a workspace, not the whole repository', async () => {
		client.send({ method: 'textDocument/didOpen', params: { textDocument: { uri, languageId: 'javascript', version: 1, text } } });
		await client.request('textDocument/diagnostic', { textDocument: { uri } });

		assert.deepEqual(client.registrations.map((registration) => registration.id), [watcherOf(extensionDir)]);
	});

	it('lints with the project config chef lint takes for the extension', async () => {
		const response = await client.request('textDocument/diagnostic', { textDocument: { uri } });
		const items = response.result.items as Array<{ code: string; severity: number }>;

		// an error, as the config says, not a warning of oxlint's defaults
		assert.deepEqual(items.map((d) => [d.code, d.severity]), [['eslint(no-debugger)', 1]]);
	});

	it('serves a file outside any extension in its own directory', async () => {
		const toolPath = path.join(root, 'tools', 'build', 'make.js');
		fs.mkdirSync(path.dirname(toolPath), { recursive: true });
		await open(toolPath, 'debugger;\n');

		assert.include(client.registrations.map((registration) => registration.id), watcherOf(path.dirname(toolPath)));
		assert.notInclude(client.registrations.map((registration) => registration.id), watcherOf(root));
	});

	it('does not serve files chef lint never lints', async () => {
		const libraryDir = path.join(root, 'node_modules', 'library');
		fs.mkdirSync(libraryDir, { recursive: true });
		fs.writeFileSync(path.join(libraryDir, 'package.json'), '{}\n');
		const response = await open(path.join(libraryDir, 'index.js'), 'debugger;\n');

		assert.deepEqual(response.result.items, []);
		assert.notInclude(client.registrations.map((registration) => registration.id), watcherOf(libraryDir));
	});

	it('does not serve the whole repository for a file in its root', async () => {
		const response = await open(path.join(root, 'webpack.config.js'), 'debugger;\n');

		assert.deepEqual(response.result.items, []);
		assert.notInclude(client.registrations.map((registration) => registration.id), watcherOf(root));
	});

	it('keeps the messages held for an extension when the editor folders change', async () => {
		const otherDir = path.join(root, 'ui', 'install', 'js', 'ui', 'other');
		const otherPath = path.join(otherDir, 'src', 'other.js');
		fs.mkdirSync(path.dirname(otherPath), { recursive: true });
		fs.writeFileSync(path.join(otherDir, 'bundle.config.js'), 'module.exports = {};\n');
		fs.writeFileSync(otherPath, 'export const other = 1;\n');

		// the extension is not served yet when the folders change
		const diagnostics = open(otherPath, 'export const other = 1;\ndebugger;\n');
		client.send({
			method: 'workspace/didChangeWorkspaceFolders',
			params: { event: { added: [{ uri: pathToFileURL(path.join(root, 'ui')).href, name: 'ui' }], removed: [] } },
		});
		const codes = ((await diagnostics).result.items as Array<{ code: string }>).map((d) => d.code);

		assert.include(codes, 'eslint(no-debugger)');
	});
});

describe('oxlint language server for an editor that fails to give its configuration', function ()
{
	this.timeout(60000);

	const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-oxlint-lsp-test-')));
	const filePath = path.join(root, 'ext', 'src', 'wrap.js');
	const uri = pathToFileURL(filePath).href;
	const text = 'export const wrap = "x"\n';
	let client: Client;

	before(async () => {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, text);
		client = new Client(root);
		client.configurationFails = true;
		await client.request('initialize', {
			processId: process.pid,
			rootUri: pathToFileURL(root).href,
			capabilities: {
				workspace: { configuration: true, diagnostics: { refreshSupport: true } },
				textDocument: { diagnostic: { dynamicRegistration: true } },
			},
		});
		client.send({ method: 'initialized', params: {} });
	});

	after(() => {
		client.stop();
		fs.rmSync(root, { recursive: true, force: true });
	});

	it('lints with the presets', async () => {
		client.send({ method: 'textDocument/didOpen', params: { textDocument: { uri, languageId: 'javascript', version: 1, text } } });
		const response = await client.request('textDocument/diagnostic', { textDocument: { uri } });
		const codes = (response.result.items as Array<{ code: string }>).map((d) => d.code);

		assert.include(codes, '@stylistic(semi)');
		assert.include(codes, '@stylistic(quotes)');
	});
});

describe('oxlint language server with several extensions open', function ()
{
	this.timeout(60000);

	const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-oxlint-lsp-test-')));
	const documents = [
		{ filePath: path.join(root, 'first', 'src', 'first.js'), text: 'export const first = value ? value : "x"\n' },
		{ filePath: path.join(root, 'second', 'src', 'second.js'), text: 'export const second = 1;\nexport function more()\n{\n\treturn [second,second];\n}\n' },
	];
	let client: Client;

	const lint = async (filePath: string) => {
		const response = await client.request('textDocument/diagnostic', { textDocument: { uri: pathToFileURL(filePath).href } });

		return response.result.items as Array<{ code: string; message: string }>;
	};

	before(async () => {
		for (const { filePath, text } of documents)
		{
			fs.mkdirSync(path.dirname(filePath), { recursive: true });
			fs.writeFileSync(path.join(path.dirname(filePath), '..', 'bundle.config.js'), 'module.exports = {};\n');
			fs.writeFileSync(filePath, text);
		}
		client = new Client(root);
		await client.request('initialize', {
			processId: process.pid,
			rootUri: pathToFileURL(root).href,
			capabilities: {
				workspace: { configuration: true, diagnostics: { refreshSupport: true } },
				textDocument: { diagnostic: { dynamicRegistration: true } },
			},
		});
		client.send({ method: 'initialized', params: {} });
	});

	after(() => {
		client.stop();
		fs.rmSync(root, { recursive: true, force: true });
	});

	it('runs JS plugin rules for an extension linted before another one', async () => {
		for (const { filePath, text } of documents)
		{
			client.send({ method: 'textDocument/didOpen', params: { textDocument: { uri: pathToFileURL(filePath).href, languageId: 'javascript', version: 1, text } } });
			await lint(filePath);
		}

		const items = await lint(documents[0].filePath);

		assert.include(items.map((d) => d.code), '@stylistic(quotes)');
		assert.isFalse(items.some((d) => d.message.includes('Error running JS plugin')));
	});
});

describe('oxlint language server with many extensions opened at once', function ()
{
	this.timeout(60000);

	const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-oxlint-lsp-test-')));
	const text = 'debugger;\n';
	const uris = Array.from({ length: 100 }, (_, index) => pathToFileURL(path.join(root, `ext${index}`, 'src', 'index.js')).href);
	let client: Client;

	before(async () => {
		fs.writeFileSync(path.join(root, '.oxlintrc.json'), JSON.stringify({ categories: { correctness: 'off' }, rules: { 'no-debugger': 'error' } }));
		for (let index = 0; index < uris.length; index++)
		{
			fs.mkdirSync(path.join(root, `ext${index}`, 'src'), { recursive: true });
			fs.writeFileSync(path.join(root, `ext${index}`, 'bundle.config.js'), 'module.exports = {};\n');
		}
		client = new Client(root);
		// what the JetBrains Oxc plugin declares
		await client.request('initialize', {
			processId: process.pid,
			workspaceFolders: [{ uri: pathToFileURL(root).href, name: 'root' }],
			capabilities: {
				workspace: { configuration: true, didChangeWatchedFiles: { dynamicRegistration: true }, diagnostics: { refreshSupport: true } },
				textDocument: { diagnostic: { dynamicRegistration: true } },
			},
		});
		client.send({ method: 'initialized', params: {} });
	});

	after(() => {
		client.stop();
		fs.rmSync(root, { recursive: true, force: true });
	});

	it('answers for every document, as an editor restoring its tabs needs', async () => {
		uris.forEach((uri) => client.send({ method: 'textDocument/didOpen', params: { textDocument: { uri, languageId: 'javascript', version: 1, text } } }));
		const responses = await Promise.all(uris.map((uri) => client.request('textDocument/diagnostic', { textDocument: { uri } })));

		assert.isTrue(responses.every((response) => response.result.items.some((d: { code: string }) => d.code === 'eslint(no-debugger)')));
	});
});
