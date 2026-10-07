import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, it, before, after } from 'mocha';
import { assert } from 'chai';

type Message = { id?: number; method?: string; params?: any; result?: any };

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
				this.send({ id: message.id, result: message.method === 'workspace/configuration' ? message.params.items.map(() => ({})) : null });
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
