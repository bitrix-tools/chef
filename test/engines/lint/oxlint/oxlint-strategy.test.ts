import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { OxlintStrategy } from '../../../../src/modules/engines/lint/oxlint/oxlint-strategy';

const FLOW_SOURCE = [
	"import { Type } from 'main.core';",
	'',
	'export function wrap(value: ?string): ?string',
	'{',
	"\treturn Type.isString(value) ? value : \"\"",
	'}',
	'',
].join('\n');

describe('OxlintStrategy', function ()
{
	this.timeout(60000);

	let root: string;
	let sourcePath: string;
	let filePath: string;

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-oxlint-test-'));
		sourcePath = path.join(root, 'ext', 'src');
		filePath = path.join(sourcePath, 'wrap.js');
		fs.mkdirSync(sourcePath, { recursive: true });
		fs.writeFileSync(filePath, FLOW_SOURCE);
	});

	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	it('matches when oxlint is requested', () => {
		const strategy = new OxlintStrategy();

		assert.isTrue(strategy.match({ sourcePath, rootPath: root, linter: 'oxlint' }));
		assert.isFalse(strategy.match({ sourcePath, rootPath: root, linter: 'eslint' }));
	});

	it('lints a Flow file and reports positions of the original', async () => {
		const result = await new OxlintStrategy().lint({ sourcePath, rootPath: root, linter: 'oxlint' });
		const messages = result.files.find((file) => file.filePath === filePath)?.messages ?? [];
		const byRule = (ruleId: string) => messages.filter((message) => message.ruleId === ruleId);

		assert.deepEqual(byRule('@stylistic/semi').map((m) => [m.line, m.column]), [[5, 42]]);
		assert.deepEqual(byRule('@stylistic/quotes').map((m) => m.line), [5]);
		// the blanked `?` would otherwise make `value:  string` a double space
		assert.deepEqual(byRule('@stylistic/no-multi-spaces'), []);
		assert.deepEqual(messages.filter((m) => m.ruleId === null), []);
		assert.isTrue(result.hasErrors());
	});

	it('fixes a Flow file without touching its types', async () => {
		const result = await new OxlintStrategy().lint({ sourcePath, rootPath: root, linter: 'oxlint', fix: true });

		assert.equal(result.getFixedCount(), 1);
		assert.equal(
			fs.readFileSync(filePath, 'utf8'),
			FLOW_SOURCE.replace('value : ""', "value : '';"),
		);
		assert.isFalse(result.hasErrors());
	});

	it('reports a file nothing parses', async () => {
		fs.writeFileSync(filePath, 'const = ;\n');
		const result = await new OxlintStrategy().lint({ sourcePath, rootPath: root, linter: 'oxlint' });
		const messages = result.files[0].messages;

		assert.equal(messages.length, 1);
		assert.isNull(messages[0].ruleId);
		assert.match(messages[0].message, /^Parsing error/);
	});
});
