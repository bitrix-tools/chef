import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { DeclarationEmitter } from '../../src/modules/engines/build/declaration-emitter';

let tmpDir: string;
let emitter: DeclarationEmitter;

function createTempExtension(files: Record<string, string>): { packageRoot: string; input: string }
{
	const srcDir = path.join(tmpDir, 'src');
	fs.mkdirSync(srcDir, { recursive: true });

	let inputPath = '';

	for (const [filePath, content] of Object.entries(files))
	{
		const fullPath = path.join(srcDir, filePath);
		fs.mkdirSync(path.dirname(fullPath), { recursive: true });
		fs.writeFileSync(fullPath, content, 'utf-8');

		if (!inputPath || filePath === 'index.ts')
		{
			inputPath = fullPath;
		}
	}

	return { packageRoot: tmpDir, input: inputPath };
}

async function emitAndRead(
	files: Record<string, string>,
	namespace = 'BX.Test',
): Promise<string>
{
	const { packageRoot, input } = createTempExtension(files);
	const outputPath = path.join(tmpDir, 'dist', 'bundle.d.ts');
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });

	await emitter.emit({ packageRoot, input, namespace, outputPath });

	if (!fs.existsSync(outputPath))
	{
		return '';
	}

	return fs.readFileSync(outputPath, 'utf-8');
}

async function validateDeclarations(content: string, validationCode: string): Promise<string[]>
{
	const testFile = path.join(tmpDir, 'dist', 'validate.ts');
	const dtsFile = path.join(tmpDir, 'dist', 'bundle.d.ts');

	fs.writeFileSync(dtsFile, content, 'utf-8');
	fs.writeFileSync(testFile, `/// <reference path="./bundle.d.ts" />\n${validationCode}`, 'utf-8');

	const ts = await import('typescript');
	const program = ts.default.createProgram([testFile], {
		strict: true,
		noEmit: true,
		skipLibCheck: true,
		target: ts.default.ScriptTarget.ESNext,
		module: ts.default.ModuleKind.ESNext,
	});

	const diagnostics = program.getSemanticDiagnostics();

	return diagnostics.map((d) => ts.default.flattenDiagnosticMessageText(d.messageText, '\n'));
}

describe('DeclarationEmitter', () => {
	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-dts-'));
		emitter = new DeclarationEmitter();
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	// ─── Guard clauses ───

	describe('guard clauses', () => {
		it('should not generate .d.ts for window namespace', async () => {
			const content = await emitAndRead({
				'index.ts': 'export class Foo {}',
			}, 'window');

			assert.equal(content, '');
		});

		it('should not generate .d.ts for empty namespace', async () => {
			const content = await emitAndRead({
				'index.ts': 'export class Foo {}',
			}, '');

			assert.equal(content, '');
		});

		it('should not generate .d.ts when src/ directory is missing', async () => {
			const outputPath = path.join(tmpDir, 'dist', 'bundle.d.ts');
			fs.mkdirSync(path.dirname(outputPath), { recursive: true });

			await emitter.emit({
				packageRoot: tmpDir,
				input: path.join(tmpDir, 'src', 'index.ts'),
				namespace: 'BX.Test',
				outputPath,
			});

			assert.isFalse(fs.existsSync(outputPath));
		});

		it('should not generate .d.ts when entry has no exports', async () => {
			const content = await emitAndRead({
				'index.ts': 'const x = 1;',
			});

			assert.equal(content, '');
		});
	});

	// ─── Export patterns ───

	describe('export patterns', () => {
		it('should handle direct export class in entry', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export class Widget {
						render(): string { return ''; }
					}
				`,
			});

			assert.include(content, 'declare namespace BX.Test');
			assert.include(content, 'class Widget');
			assert.include(content, 'render(): string');
		});

		it('should handle direct export interface in entry', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export interface Config {
						debug: boolean;
						timeout: number;
					}
				`,
			});

			assert.include(content, 'interface Config');
			assert.include(content, 'debug: boolean');
		});

		it('should handle direct export type alias in entry', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export type Status = 'active' | 'inactive';
				`,
			});

			assert.include(content, "type Status = 'active' | 'inactive'");
		});

		it('should handle direct export function in entry', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export function calculate(a: number, b: number): number {
						return a + b;
					}
				`,
			});

			assert.include(content, 'function calculate(a: number, b: number): number');
		});

		it('should handle direct export const in entry', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export const VERSION: string = '1.0.0';
				`,
			});

			assert.include(content, 'const VERSION: string');
		});

		it('should handle direct export enum in entry', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export enum Direction {
						Up = 'UP',
						Down = 'DOWN',
					}
				`,
			});

			assert.include(content, 'enum Direction');
			assert.include(content, 'Up');
			assert.include(content, 'Down');
		});

		it('should handle export { Name } from local import', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import Widget from './widget';
					export { Widget };
				`,
				'widget.ts': `
					export default class Widget {
						show(): void {}
					}
				`,
			});

			assert.include(content, 'class Widget');
			assert.include(content, 'show(): void');
		});

		it('should handle export { Name as Alias }', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import InternalWidget from './widget';
					export { InternalWidget as Widget };
				`,
				'widget.ts': `
					export default class InternalWidget {
						show(): void {}
					}
				`,
			});

			assert.include(content, 'class Widget');
			assert.notInclude(content, 'InternalWidget');
		});

		it('should handle export * from module', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export * from './helpers';
				`,
				'helpers.ts': `
					export function format(value: string): string { return value; }
					export function parse(input: string): number { return 0; }
				`,
			});

			assert.include(content, 'function format(value: string): string');
			assert.include(content, 'function parse(input: string): number');
		});

		it('should handle export type * from module', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export type * from './types';
				`,
				'types.ts': `
					export type Color = 'red' | 'green' | 'blue';
					export interface Point { x: number; y: number; }
				`,
			});

			assert.include(content, 'type Color');
			assert.include(content, 'interface Point');
		});

		it('should handle export { A, B } from module', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export { Serializer, Deserializer } from './codec';
				`,
				'codec.ts': `
					export class Serializer {
						encode(data: unknown): string { return ''; }
					}
					export class Deserializer {
						decode(raw: string): unknown { return null; }
					}
				`,
			});

			assert.include(content, 'class Serializer');
			assert.include(content, 'class Deserializer');
		});

		it('should handle export type { A } from module', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export type { Options } from './config';
				`,
				'config.ts': `
					export interface Options {
						verbose: boolean;
					}
				`,
			});

			assert.include(content, 'interface Options');
		});

		it('should handle nested star re-exports', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export * from './barrel';
				`,
				'barrel.ts': `
					export * from './models';
				`,
				'models.ts': `
					export class User { name: string = ''; }
					export class Group { title: string = ''; }
				`,
			});

			assert.include(content, 'class User');
			assert.include(content, 'class Group');
		});

		it('should not duplicate when same name exported via multiple paths', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import Logger from './logger';
					export { Logger };
					export * from './logger-reexport';
				`,
				'logger.ts': `
					export default class Logger {
						log(msg: string): void {}
					}
				`,
				'logger-reexport.ts': `
					export { default as Logger } from './logger';
				`,
			});

			const matches = content.match(/class Logger/g);
			assert.equal(matches?.length, 1, 'Logger class should appear exactly once');
		});
	});

	// ─── Default export patterns ───

	describe('default export patterns', () => {
		it('should handle export default class', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import App from './app';
					export { App };
				`,
				'app.ts': `
					export default class App {
						start(): void {}
					}
				`,
			});

			assert.include(content, 'class App');
			assert.include(content, 'start(): void');
		});

		it('should handle export default function', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import createApp from './factory';
					export { createApp };
				`,
				'factory.ts': `
					interface AppInstance { run(): void; }
					export default function createApp(): AppInstance { return { run() {} }; }
				`,
			});

			assert.include(content, 'function createApp');
		});

		it('should handle export default identifier (declare const pattern)', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import config from './config';
					export { config };
				`,
				'config.ts': `
					const config = { debug: false, version: '1.0' };
					export default config;
				`,
			});

			assert.include(content, 'config');
		});

		it('should rename default export to import alias', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import MyService from './service';
					export { MyService };
				`,
				'service.ts': `
					export default class InternalService {
						execute(): void {}
					}
				`,
			});

			assert.include(content, 'class MyService');
			assert.notInclude(content, 'InternalService');
		});
	});

	// ─── Import patterns ───

	describe('import patterns', () => {
		it('should handle named import with alias', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import { OriginalName as PublicName } from './module';
					export { PublicName };
				`,
				'module.ts': `
					export class OriginalName {
						getValue(): string { return ''; }
					}
				`,
			});

			assert.include(content, 'class PublicName');
		});

		it('should handle multiple named imports from same module', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import { Alpha, Beta } from './module';
					export { Alpha, Beta };
				`,
				'module.ts': `
					export class Alpha { a(): void {} }
					export class Beta { b(): void {} }
				`,
			});

			assert.include(content, 'class Alpha');
			assert.include(content, 'class Beta');
		});
	});

	// ─── Dependency type resolution ───

	describe('dependency types', () => {
		it('should include types referenced in exported class signatures', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import Handler from './handler';
					export { Handler };
				`,
				'handler.ts': `
					import type { EventData } from './event-data';
					export default class Handler {
						process(data: EventData): void {}
					}
				`,
				'event-data.ts': `
					export type EventData = {
						type: string;
						payload: unknown;
					};
				`,
			});

			assert.include(content, 'class Handler');
			assert.include(content, 'type EventData');
		});

		it('should not include unreferenced imports from dependency files', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import Service from './service';
					export { Service };
				`,
				'service.ts': `
					import { InternalHelper } from './helper';
					import type { PublicType } from './types';
					export default class Service {
						getData(): PublicType { return { id: 1 }; }
					}
				`,
				'helper.ts': `
					export class InternalHelper {
						secret(): void {}
					}
				`,
				'types.ts': `
					export type PublicType = { id: number };
				`,
			});

			assert.include(content, 'class Service');
			assert.include(content, 'type PublicType');
			assert.notInclude(content, 'InternalHelper');
		});

		it('should handle circular file references without infinite loop', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import NodeA from './node-a';
					export { NodeA };
				`,
				'node-a.ts': `
					import type NodeB from './node-b';
					export default class NodeA {
						next: NodeB | null = null;
					}
				`,
				'node-b.ts': `
					import type NodeA from './node-a';
					export default class NodeB {
						prev: NodeA | null = null;
					}
				`,
			});

			assert.include(content, 'class NodeA');
		});

		it('should resolve non-exported types used in public signatures', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import Grid from './grid';
					export { Grid };
				`,
				'grid.ts': `
					interface CellData {
						row: number;
						col: number;
					}

					export default class Grid {
						getCell(x: number, y: number): CellData { return { row: x, col: y }; }
					}
				`,
			});

			assert.include(content, 'class Grid');
			assert.include(content, 'interface CellData');
		});

		it('should resolve unique symbol declarations', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import Token from './token';
					export { Token };
				`,
				'token.ts': `
					const tag = Symbol.for('Token.tag');

					export default class Token {
						[tag]: string;
						constructor(value: string) {
							this[tag] = value;
						}
					}
				`,
			});

			assert.include(content, 'class Token');
			assert.include(content, 'const tag: unique symbol');
			assert.notInclude(content, 'declare const tag');
		});

		it('should resolve default import alias for builtin re-export', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import Store from './store';
					export { Store };
				`,
				'store.ts': `
					import Storage from './storage';
					export default class Store {
						storage: Storage<string, number> = new Map();
					}
				`,
				'storage.ts': `
					export default Map;
				`,
			});

			assert.include(content, 'class Store');
			assert.include(content, 'type Storage');
			assert.include(content, 'Map');
		});

		it('should infer generic params for builtin re-export alias', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import Cache from './cache';
					export { Cache };
				`,
				'cache.ts': `
					import CustomMap from './custom-map';
					export default class Cache<T> {
						data: CustomMap<string, T> = new Map();
					}
				`,
				'custom-map.ts': `
					export default Map;
				`,
			});

			assert.include(content, 'class Cache');
			assert.match(content, /type CustomMap<.+>\s*=\s*Map<.+>/);
		});

		it('should resolve transitive dependency types across multiple files', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import Controller from './controller';
					export { Controller };
				`,
				'controller.ts': `
					import type { Action } from './action';
					export default class Controller {
						dispatch(action: Action): void {}
					}
				`,
				'action.ts': `
					import type { Payload } from './payload';
					export type Action = {
						type: string;
						data: Payload;
					};
				`,
				'payload.ts': `
					export type Payload = {
						value: unknown;
						timestamp: number;
					};
				`,
			});

			assert.include(content, 'class Controller');
			assert.include(content, 'type Action');
			assert.include(content, 'type Payload');
		});
	});

	// ─── Namespace vs top-level placement ───

	describe('placement', () => {
		it('should place types and interfaces outside namespace', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export type Mode = 'light' | 'dark';
					export interface Theme { mode: Mode; }
					export class ThemeManager {
						current: Theme = { mode: 'light' };
					}
				`,
			});

			const nsStart = content.indexOf('declare namespace');
			assert.isAbove(nsStart, 0);
			assert.isBelow(content.indexOf('type Mode'), nsStart);
			assert.isBelow(content.indexOf('interface Theme'), nsStart);
			assert.isAbove(content.indexOf('class ThemeManager'), nsStart);
		});

		it('should qualify namespace member references in top-level types', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import Emitter from './emitter';
					export { Emitter };
					export type * from './types';
				`,
				'emitter.ts': `
					export default class Emitter {
						emit(name: string): void {}
					}
				`,
				'types.ts': `
					import type Emitter from '../src/emitter';
					export type ListenerMap = {
						emitter: Emitter;
					};
				`,
			});

			// ListenerMap is a type → outside namespace
			// Emitter is a class → inside namespace
			// ListenerMap should reference BX.Test.Emitter, not just Emitter
			assert.include(content, 'BX.Test.Emitter');
		});

		it('should produce output with only types (no namespace block)', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export type Flag = boolean;
					export interface Coords { lat: number; lng: number; }
				`,
			});

			assert.include(content, 'type Flag');
			assert.include(content, 'interface Coords');
			assert.notInclude(content, 'declare namespace');
		});

		it('should produce output with only namespace members (no top-level types)', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export class Only {
						value: number = 0;
					}
				`,
			});

			assert.include(content, 'declare namespace BX.Test');
			assert.include(content, 'class Only');
		});
	});

	// ─── Formatting ───

	describe('formatting', () => {
		it('should start with eslint-disable comment', async () => {
			const content = await emitAndRead({
				'index.ts': 'export class Minimal {}',
			});

			assert.isTrue(content.startsWith('/* eslint-disable */\n'));
		});

		it('should end with trailing newline', async () => {
			const content = await emitAndRead({
				'index.ts': 'export class Minimal {}',
			});

			assert.isTrue(content.endsWith('\n'));
		});

		it('should use tab indentation inside namespace', async () => {
			const content = await emitAndRead({
				'index.ts': 'export class Item { value: string = ""; }',
			});

			const nsBody = content.split('declare namespace BX.Test {')[1];
			assert.isOk(nsBody);

			const lines = nsBody.split('\n').filter((l) => l.trim().length > 0 && l.trim() !== '}');
			for (const line of lines)
			{
				assert.isTrue(line.startsWith('\t'), `Line should start with tab: "${line}"`);
			}
		});

		it('should convert 4-space indentation to tabs', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export class Nested {
						method(opts: { a: number; b: string }): void {}
					}
				`,
			});

			assert.notMatch(content, /^ {4}/m, 'Should not contain 4-space indentation');
		});

		it('should filter #private lines', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export class Secure {
						#secret: string = '';
						public visible: number = 0;
						getSecret(): string { return this.#secret; }
					}
				`,
			});

			assert.notInclude(content, '#private');
			assert.notInclude(content, '#secret');
			assert.include(content, 'visible: number');
			assert.include(content, 'getSecret(): string');
		});

		it('should strip export and declare keywords from declarations', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export class Widget {}
					export type Mode = 'a' | 'b';
				`,
			});

			assert.notMatch(content, /^export\s/m);
		});
	});

	// ─── JSDoc handling ───

	describe('JSDoc', () => {
		it('should preserve JSDoc directly above declaration', async () => {
			const content = await emitAndRead({
				'index.ts': `
					/** The main application class */
					export class App {
						/** Starts the application */
						start(): void {}
					}
				`,
			});

			assert.include(content, '/** The main application class */');
			assert.include(content, '/** Starts the application */');
		});

		it('should preserve multi-line JSDoc', async () => {
			const content = await emitAndRead({
				'index.ts': `
					/**
					 * Represents a user entity.
					 * @example
					 * const user = new User('John');
					 */
					export class User {
						name: string;
						constructor(name: string) { this.name = name; }
					}
				`,
			});

			assert.include(content, 'Represents a user entity.');
			assert.include(content, '@example');
		});

		it('should not add JSDoc when none exists', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export class Plain {
						value: number = 0;
					}
				`,
			});

			assert.notInclude(content, '/**');
		});
	});

	// ─── Generics ───

	describe('generics', () => {
		it('should handle class with generic parameters', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export class Container<T> {
						items: T[] = [];
						add(item: T): void { this.items.push(item); }
						get(index: number): T | undefined { return this.items[index]; }
					}
				`,
			});

			assert.include(content, 'class Container<T>');
			assert.include(content, 'add(item: T): void');
			assert.include(content, 'get(index: number): T | undefined');
		});

		it('should handle interface with generics', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export interface Repository<T, K = string> {
						findById(id: K): T | null;
						save(entity: T): void;
					}
				`,
			});

			assert.include(content, 'interface Repository<T, K = string>');
		});

		it('should handle generic function', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export function identity<T>(value: T): T { return value; }
				`,
			});

			assert.include(content, 'function identity<T>(value: T): T');
		});
	});

	// ─── Complex type expressions ───

	describe('complex types', () => {
		it('should handle interface extending another from different file', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export type * from './types';
				`,
				'types.ts': `
					export interface Base {
						id: number;
					}
					export interface Extended extends Base {
						name: string;
					}
				`,
			});

			assert.include(content, 'interface Base');
			assert.include(content, 'interface Extended extends Base');
		});

		it('should handle union and intersection types', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
					export type WithId<T> = T & { id: number };
				`,
			});

			assert.include(content, 'type Result');
			assert.include(content, 'type WithId');
		});

		it('should handle const enum', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export const enum Priority {
						Low = 0,
						Medium = 1,
						High = 2,
					}
				`,
			});

			assert.include(content, 'const enum Priority');
		});
	});

	// ─── Re-export chains (barrel files) ───

	describe('barrel files', () => {
		it('should resolve re-exports through barrel index file', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export * from './lib/index';
				`,
				'lib/index.ts': `
					export { default as Client } from './client';
					export { default as Server } from './server';
				`,
				'lib/client.ts': `
					export default class Client {
						connect(): void {}
					}
				`,
				'lib/server.ts': `
					export default class Server {
						listen(port: number): void {}
					}
				`,
			});

			assert.include(content, 'class Client');
			assert.include(content, 'class Server');
		});

		it('should handle index.ts in subdirectory as module', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export type * from './types';
				`,
				'types/index.ts': `
					export type Size = 'small' | 'medium' | 'large';
					export type Variant = 'primary' | 'secondary';
				`,
			});

			assert.include(content, 'type Size');
			assert.include(content, 'type Variant');
		});

		it('should follow named re-export chains across multiple files', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export { Actions } from './sets/index';
					export { Icon } from './icon';
				`,
				'sets/index.ts': `
					export { Actions } from './actions';
				`,
				'sets/actions.ts': `
					export const Actions = Object.freeze({
						SAVE: 'save',
						DELETE: 'delete',
					} as const);
				`,
				'icon.ts': `
					export class Icon {
						name: string = '';
						render(): HTMLElement { return document.createElement('div'); }
					}
				`,
			});

			assert.include(content, 'Actions');
			assert.include(content, 'SAVE');
			assert.include(content, 'DELETE');
			assert.include(content, 'class Icon');
		});

		it('should export local declarations referenced by export { X }', async () => {
			const content = await emitAndRead({
				'index.ts': `
					const BIcon = {
						props: {
							name: { type: String as unknown as StringConstructor, required: true as const },
						},
						template: '<div></div>',
					};
					export { BIcon };
				`,
			});

			assert.include(content, 'BIcon');
			assert.include(content, 'props');
		});

		it('should follow star re-export through named re-export chain', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export * from './sets/index';
				`,
				'sets/index.ts': `
					export { Main } from './main';
					export { Social } from './social';
				`,
				'sets/main.ts': `
					export const Main = Object.freeze({
						HOME: 'home',
						SEARCH: 'search',
					} as const);
				`,
				'sets/social.ts': `
					export const Social = Object.freeze({
						LIKE: 'like',
						SHARE: 'share',
					} as const);
				`,
			});

			assert.include(content, 'Main');
			assert.include(content, 'HOME');
			assert.include(content, 'Social');
			assert.include(content, 'LIKE');
		});
	});

	// ─── Source formatting variations ───

	describe('source formatting variations', () => {
		it('should handle single-line class body', async () => {
			const content = await emitAndRead({
				'index.ts': `export class Compact { name: string = ''; getValue(): string { return this.name; } }`,
			});

			assert.include(content, 'class Compact');
			assert.include(content, 'name: string');
			assert.include(content, 'getValue(): string');
		});

		it('should handle class with no spaces around braces', async () => {
			const content = await emitAndRead({
				'index.ts': `export class Dense{
name:string='';
count:number=0;
getCount():number{return this.count;}
}`,
			});

			assert.include(content, 'class Dense');
			assert.include(content, 'name: string');
			assert.include(content, 'count: number');
			assert.include(content, 'getCount(): number');
		});

		it('should handle exports without semicolons', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export class NoSemicolon {
						value: string = ''
						process(): void {}
					}
					export type Mode = 'a' | 'b'
					export interface Config {
						mode: Mode
					}
				`,
			});

			assert.include(content, 'class NoSemicolon');
			assert.include(content, 'type Mode');
			assert.include(content, 'interface Config');
		});

		it('should handle mixed indentation in source (tabs and spaces)', async () => {
			const content = await emitAndRead({
				'index.ts': 'export class MixedIndent {\n\t  name: string = \'\';\n    count: number = 0;\n\tgetValue(): string { return this.name; }\n}',
			});

			assert.include(content, 'class MixedIndent');
			assert.include(content, 'name: string');
			// Output must use tabs only
			const bodyLines = content.split('\n').filter((l: string) => l.startsWith('\t'));
			for (const line of bodyLines)
			{
				assert.notMatch(line, /^ {4}/, `Should not contain leading 4-spaces: "${line}"`);
			}
		});

		it('should handle heavily indented source (template literal artifact)', async () => {
			const content = await emitAndRead({
				'index.ts': `
								export class DeepIndent {
												name: string = '';
												run(): void {}
								}
				`,
			});

			assert.include(content, 'class DeepIndent');
			assert.include(content, 'name: string');
			assert.include(content, 'run(): void');
		});

		it('should handle export with extra whitespace', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import  Loader  from  './loader' ;
					export  {  Loader  } ;
				`,
				'loader.ts': `
					export  default  class  Loader {
						load() : void {}
					}
				`,
			});

			assert.include(content, 'class Loader');
			assert.include(content, 'load(): void');
		});

		it('should handle multi-line import and export statements', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import {
						Alpha,
						Beta,
					} from './module';
					export {
						Alpha,
						Beta,
					};
				`,
				'module.ts': `
					export class Alpha {
						run(): void {}
					}
					export class Beta {
						stop(): void {}
					}
				`,
			});

			assert.include(content, 'class Alpha');
			assert.include(content, 'class Beta');
		});

		it('should handle re-export with trailing comma', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export { Foo, } from './foo';
				`,
				'foo.ts': `
					export class Foo {
						bar(): void {}
					}
				`,
			});

			assert.include(content, 'class Foo');
			assert.include(content, 'bar(): void');
		});

		it('should handle class with methods using arrow function properties', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export class ArrowProps {
						onClick = (event: string): void => {};
						onHover: (target: HTMLElement) => boolean = () => true;
					}
				`,
			});

			assert.include(content, 'class ArrowProps');
		});

		it('should handle interface with optional and readonly properties', async () => {
			const content = await emitAndRead({
				'index.ts': `
export interface Strict {
readonly id: number;
name?: string;
readonly tags?: string[];
}`,
			});

			assert.include(content, 'interface Strict');
			assert.include(content, 'readonly id: number');
			assert.include(content, 'name?: string');
			assert.include(content, 'readonly tags?: string[]');
		});

		it('should handle type with template literal types', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export type EventName = \`on\${string}\`;
					export type CssVar = \`--\${string}\`;
				`,
			});

			assert.include(content, 'type EventName');
			assert.include(content, 'type CssVar');
		});

		it('should handle single-line exports from different files', async () => {
			const content = await emitAndRead({
				'index.ts': `export { A } from './a'; export { B } from './b';`,
				'a.ts': `export class A { run(): void {} }`,
				'b.ts': `export class B { stop(): void {} }`,
			});

			assert.include(content, 'class A');
			assert.include(content, 'class B');
		});

		it('should handle source with CRLF line endings', async () => {
			const content = await emitAndRead({
				'index.ts': 'export class CrLf {\r\n\tname: string = \'\';\r\n\tgetName(): string { return this.name; }\r\n}\r\n',
			});

			assert.include(content, 'class CrLf');
			assert.include(content, 'name: string');
			assert.include(content, 'getName(): string');
		});

		it('should handle abstract class', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export abstract class Base {
						abstract run(): void;
						log(msg: string): void { console.log(msg); }
					}
				`,
			});

			assert.include(content, 'abstract class Base');
			assert.include(content, 'abstract run(): void');
			assert.include(content, 'log(msg: string): void');
		});

		it('should handle overloaded function signatures', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export function create(name: string): string;
					export function create(name: string, age: number): string;
					export function create(name: string, age?: number): string {
						return name;
					}
				`,
			});

			assert.include(content, 'function create(name: string): string');
			assert.include(content, 'function create(name: string, age: number): string');
		});

		it('should handle class with static members', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export class Registry {
						static instance: Registry;
						static getInstance(): Registry { return Registry.instance; }
						name: string = '';
					}
				`,
			});

			assert.include(content, 'class Registry');
			assert.include(content, 'static instance: Registry');
			assert.include(content, 'static getInstance(): Registry');
			assert.include(content, 'name: string');
		});

		it('should handle class extending another with generics', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export class Collection<T> {
						#items: T[] = [];
						add(item: T): void { this.#items.push(item); }
						get(index: number): T { return this.#items[index]; }
					}
					export class StringCollection extends Collection<string> {
						join(sep: string): string { return ''; }
					}
				`,
			});

			assert.include(content, 'class Collection<T>');
			assert.include(content, 'class StringCollection extends Collection<string>');
			assert.include(content, 'add(item: T): void');
			assert.include(content, 'join(sep: string): string');
		});
	});

	// ─── Additional TypeScript syntax ───

	describe('additional TypeScript syntax', () => {
		it('should handle class implementing interface', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export interface Printable {
						print(): string;
					}
					export class Document implements Printable {
						print(): string { return ''; }
					}
				`,
			});

			assert.include(content, 'interface Printable');
			assert.include(content, 'class Document implements Printable');
		});

		it('should handle interface extending multiple interfaces', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export interface Readable {
						read(): string;
					}
					export interface Writable {
						write(data: string): void;
					}
					export interface ReadWritable extends Readable, Writable {
						flush(): void;
					}
				`,
			});

			assert.include(content, 'interface ReadWritable extends Readable, Writable');
		});

		it('should handle conditional types', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export type IsString<T> = T extends string ? true : false;
					export type Unwrap<T> = T extends Promise<infer U> ? U : T;
				`,
			});

			assert.include(content, 'type IsString<T>');
			assert.include(content, 'T extends string ? true : false');
			assert.include(content, 'type Unwrap<T>');
			assert.include(content, 'infer U');
		});

		it('should handle mapped types', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export type Readonly2<T> = { readonly [K in keyof T]: T[K] };
					export type Partial2<T> = { [K in keyof T]?: T[K] };
					export type Nullable<T> = { [K in keyof T]: T[K] | null };
				`,
			});

			assert.include(content, 'type Readonly2<T>');
			assert.include(content, 'type Partial2<T>');
			assert.include(content, 'type Nullable<T>');
		});

		it('should handle index signatures', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export interface StringMap {
						[key: string]: string;
					}
					export interface NumberMap {
						[index: number]: string;
					}
				`,
			});

			assert.include(content, '[key: string]: string');
			assert.include(content, '[index: number]: string');
		});

		it('should handle tuple types', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export type Pair<A, B> = [A, B];
					export type NamedTuple = [first: string, second: number];
					export type VarArgs = [string, ...number[]];
				`,
			});

			assert.include(content, 'type Pair<A, B> = [A, B]');
			assert.include(content, 'type NamedTuple = [first: string, second: number]');
			assert.include(content, 'type VarArgs = [string, ...number[]]');
		});

		it('should handle getter and setter', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export class Settings {
						#value: string = '';
						get value(): string { return this.#value; }
						set value(v: string) { this.#value = v; }
					}
				`,
			});

			assert.include(content, 'class Settings');
			assert.include(content, 'get value(): string');
			assert.include(content, 'set value(v: string)');
		});

		it('should handle discriminated unions', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export type Success = { kind: 'success'; data: string };
					export type Failure = { kind: 'failure'; error: Error };
					export type Result = Success | Failure;
				`,
			});

			assert.include(content, 'type Success');
			assert.include(content, 'type Failure');
			assert.include(content, 'type Result = Success | Failure');
		});

		it('should handle class method overloads', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export class Parser {
						parse(input: string): object;
						parse(input: Buffer): object;
						parse(input: string | Buffer): object {
							return {};
						}
					}
				`,
			});

			assert.include(content, 'parse(input: string): object');
			assert.include(content, 'parse(input: Buffer): object');
		});

		it('should handle constructor with access modifiers', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export class Entity {
						constructor(
							public readonly id: number,
							protected name: string,
							private secret: string,
						) {}
					}
				`,
			});

			assert.include(content, 'class Entity');
			assert.include(content, 'readonly id: number');
		});

		it('should handle type predicates (type guards)', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export interface Cat { meow(): void; }
					export interface Dog { bark(): void; }
					export function isCat(animal: Cat | Dog): animal is Cat {
						return 'meow' in animal;
					}
				`,
			});

			assert.include(content, 'function isCat(animal: Cat | Dog): animal is Cat');
		});

		it('should handle as const exported value', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export const COLORS = ['red', 'green', 'blue'] as const;
					export const CONFIG = { debug: false, version: 1 } as const;
				`,
			});

			assert.include(content, 'const COLORS');
			assert.include(content, 'const CONFIG');
			assert.include(content, 'readonly');
		});

		it('should handle export default abstract class', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import View from './view';
					export { View };
				`,
				'view.ts': `
					export default abstract class View {
						abstract render(): string;
						mount(el: HTMLElement): void {}
					}
				`,
			});

			assert.include(content, 'abstract class View');
			assert.include(content, 'abstract render(): string');
			assert.include(content, 'mount(el: HTMLElement): void');
		});

		it('should handle utility types in signatures', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export interface FullConfig {
						host: string;
						port: number;
						debug: boolean;
					}
					export class Server {
						configure(opts: Partial<FullConfig>): void {}
						snapshot(): Readonly<FullConfig> { return { host: '', port: 0, debug: false }; }
						pick(): Pick<FullConfig, 'host' | 'port'> { return { host: '', port: 0 }; }
					}
				`,
			});

			assert.include(content, 'Partial<FullConfig>');
			assert.include(content, 'Readonly<FullConfig>');
			assert.include(content, "Pick<FullConfig, 'host' | 'port'>");
		});

		it('should handle generic constraints', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export interface HasId { id: number; }
					export function findById<T extends HasId>(items: T[], id: number): T | undefined {
						return items.find(item => item.id === id);
					}
					export class Store<T extends HasId> {
						#items: T[] = [];
						add(item: T): void { this.#items.push(item); }
					}
				`,
			});

			assert.include(content, 'T extends HasId');
			assert.include(content, 'function findById');
			assert.include(content, 'class Store<T extends HasId>');
		});

		it('should handle intersection types in class', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export type Timestamped = { createdAt: Date; updatedAt: Date };
					export type Named = { name: string };
					export class Record {
						getData(): Named & Timestamped {
							return { name: '', createdAt: new Date(), updatedAt: new Date() };
						}
					}
				`,
			});

			assert.include(content, 'getData(): Named & Timestamped');
		});

		it('should handle recursive types', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export type TreeNode = {
						value: string;
						children: TreeNode[];
					};
					export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
				`,
			});

			assert.include(content, 'type TreeNode');
			assert.include(content, 'children: TreeNode[]');
			assert.include(content, 'type JsonValue');
		});

		it('should handle promise and async return types', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export class ApiClient {
						async fetch(url: string): Promise<string> { return ''; }
						async fetchJson<T>(url: string): Promise<T> { return {} as T; }
					}
				`,
			});

			assert.include(content, 'fetch(url: string): Promise<string>');
			assert.include(content, 'fetchJson<T>(url: string): Promise<T>');
		});

		it('should handle callback and function types in signatures', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export type Callback<T> = (error: Error | null, result: T) => void;
					export type Comparator<T> = (a: T, b: T) => number;
					export class EventBus {
						on(event: string, handler: (...args: unknown[]) => void): void {}
					}
				`,
			});

			assert.include(content, 'type Callback<T>');
			assert.include(content, 'type Comparator<T>');
			assert.include(content, 'handler: (...args: unknown[]) => void');
		});

		it('should handle keyof and typeof operators', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export interface Schema {
						name: string;
						age: number;
					}
					export type SchemaKey = keyof Schema;
					export const defaults: Schema = { name: '', age: 0 };
					export type Defaults = typeof defaults;
				`,
			});

			assert.include(content, 'type SchemaKey = keyof Schema');
		});

		it('should handle class with protected and public methods', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export class Component {
						public render(): string { return ''; }
						protected update(): void {}
						destroy(): void {}
					}
				`,
			});

			assert.include(content, 'render(): string');
			assert.include(content, 'protected update(): void');
			assert.include(content, 'destroy(): void');
		});

		it('should handle string and numeric literal types', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
					export type StatusCode = 200 | 201 | 400 | 404 | 500;
					export type Toggle = true | false;
				`,
			});

			assert.include(content, 'type HttpMethod');
			assert.include(content, 'type StatusCode');
		});

		it('should handle type with template literal key mapping', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export type Getters<T> = {
						[K in keyof T as \`get\${Capitalize<string & K>}\`]: () => T[K];
					};
				`,
			});

			assert.include(content, 'type Getters<T>');
		});

		it('should handle export of multiple types and values mixed', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export type Color = 'red' | 'blue';
					export interface Shape { area(): number; }
					export class Circle implements Shape {
						constructor(public radius: number) {}
						area(): number { return Math.PI * this.radius ** 2; }
					}
					export enum Size { S, M, L }
					export function createCircle(r: number): Circle { return new Circle(r); }
					export const PI: number = 3.14;
				`,
			});

			assert.include(content, 'type Color');
			assert.include(content, 'interface Shape');
			assert.include(content, 'class Circle');
			assert.include(content, 'enum Size');
			assert.include(content, 'function createCircle');
			assert.include(content, 'const PI: number');
		});
	});

	// ─── TypeScript validation ───

	describe('TypeScript validation', () => {
		it('should produce valid declarations for simple extension', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export type Status = 'active' | 'inactive';

					export interface UserData {
						name: string;
						status: Status;
					}

					export class UserManager {
						#users: UserData[] = [];
						add(user: UserData): void { this.#users.push(user); }
						findByName(name: string): UserData | undefined {
							return this.#users.find(u => u.name === name);
						}
					}
				`,
			});

			const errors = await validateDeclarations(content, `
				const userStatus: Status = 'active';
				const user: UserData = { name: 'John', status: 'active' };
				const mgr: BX.Test.UserManager = new BX.Test.UserManager();
				mgr.add(user);
				const found: UserData | undefined = mgr.findByName('John');
			`);

			assert.deepEqual(errors, [], `Type errors in generated .d.ts:\n${content}`);
		});

		it('should produce valid declarations with cross-file types', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import Processor from './processor';
					export { Processor };
					export type * from './types';
				`,
				'processor.ts': `
					import type { Job } from './types';
					export default class Processor {
						run(job: Job): void {}
					}
				`,
				'types.ts': `
					export type Priority = 'low' | 'high';
					export interface Job {
						name: string;
						priority: Priority;
					}
				`,
			});

			const errors = await validateDeclarations(content, `
				const priority: Priority = 'high';
				const job: Job = { name: 'task', priority: 'low' };
				const proc: BX.Test.Processor = new BX.Test.Processor();
				proc.run(job);
			`);

			assert.deepEqual(errors, [], `Type errors in generated .d.ts:\n${content}`);
		});

		it('should produce valid declarations with generics', async () => {
			const content = await emitAndRead({
				'index.ts': `
					export class Collection<T> {
						#items: T[] = [];
						add(item: T): void { this.#items.push(item); }
						get(index: number): T | undefined { return this.#items[index]; }
						toArray(): T[] { return [...this.#items]; }
					}
				`,
			});

			const errors = await validateDeclarations(content, `
				const col: BX.Test.Collection<string> = new BX.Test.Collection<string>();
				col.add('hello');
				const item: string | undefined = col.get(0);
				const arr: string[] = col.toArray();
			`);

			assert.deepEqual(errors, [], `Type errors in generated .d.ts:\n${content}`);
		});

		it('should produce valid declarations with namespace-qualified top-level types', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import Emitter from './emitter';
					export { Emitter };
					export type * from './types';
				`,
				'emitter.ts': `
					export default class Emitter {
						emit(name: string): void {}
					}
				`,
				'types.ts': `
					import type Emitter from '../src/emitter';
					export type EmitterOptions = {
						target: Emitter;
						maxListeners: number;
					};
				`,
			});

			const errors = await validateDeclarations(content, `
				const emitter: BX.Test.Emitter = new BX.Test.Emitter();
				const opts: EmitterOptions = { target: emitter, maxListeners: 10 };
			`);

			assert.deepEqual(errors, [], `Type errors in generated .d.ts:\n${content}`);
		});

		it('should produce valid declarations with non-exported interface in signatures', async () => {
			const content = await emitAndRead({
				'index.ts': `
					import Grid from './grid';
					export { Grid };
				`,
				'grid.ts': `
					interface Position {
						row: number;
						col: number;
					}

					export default class Grid {
						getPosition(id: string): Position { return { row: 0, col: 0 }; }
					}
				`,
			});

			const errors = await validateDeclarations(content, `
				const grid: BX.Test.Grid = new BX.Test.Grid();
				const pos = grid.getPosition('cell-1');
				const row: number = pos.row;
				const col: number = pos.col;
			`);

			assert.deepEqual(errors, [], `Type errors in generated .d.ts:\n${content}`);
		});
	});
});
