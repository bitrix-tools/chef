import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import {
	installAgentInstructions,
	upsertInstructionsBlock,
} from '../../../src/commands/init/agents/install-agent-instructions';

const blockStart = '<!-- chef:agent-instructions:start -->';
const blockEnd = '<!-- chef:agent-instructions:end -->';

function countOccurrences(text: string, search: string): number
{
	return text.split(search).length - 1;
}

describe('upsertInstructionsBlock', () => {
	it('should create the block in an empty file', () => {
		const content = upsertInstructionsBlock('');

		assert.isTrue(content.startsWith(blockStart));
		assert.include(content, 'chef help agent');
		assert.isTrue(content.endsWith(`${blockEnd}\n`));
	});

	it('should append the block after existing content', () => {
		const content = upsertInstructionsBlock('# Project\n\nOwn rules.\n');

		assert.isTrue(content.startsWith('# Project\n\nOwn rules.\n\n<!-- chef:'));
	});

	it('should replace an outdated block in place', () => {
		const outdated = `# Project\n\n${blockStart}\nold text\n${blockEnd}\n\n## Other\n`;
		const content = upsertInstructionsBlock(outdated);

		assert.notInclude(content, 'old text');
		assert.include(content, 'chef help agent');
		assert.isTrue(content.startsWith('# Project\n\n'));
		assert.isTrue(content.endsWith(`${blockEnd}\n\n## Other\n`));
	});

	it('should not change a file with the current block', () => {
		const content = upsertInstructionsBlock('# Project\n');

		assert.equal(upsertInstructionsBlock(content), content);
		assert.equal(countOccurrences(content, blockStart), 1);
	});
});

describe('installAgentInstructions', () => {
	let rootPath: string;

	beforeEach(() => {
		rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-agents-'));
	});

	afterEach(() => {
		fs.rmSync(rootPath, { recursive: true, force: true });
	});

	it('should create AGENTS.md and leave a missing CLAUDE.md alone', async () => {
		const result = await installAgentInstructions(rootPath);

		assert.deepEqual(result.files, [{ name: 'AGENTS.md', status: 'created' }]);
		assert.isFalse(result.hasLocalClaudeFileOnly);
		assert.isTrue(fs.existsSync(path.join(rootPath, 'AGENTS.md')));
		assert.isFalse(fs.existsSync(path.join(rootPath, 'CLAUDE.md')));
	});

	it('should add the block to an existing CLAUDE.md', async () => {
		fs.writeFileSync(path.join(rootPath, 'CLAUDE.md'), '# Rules\n');

		const result = await installAgentInstructions(rootPath);

		assert.deepEqual(result.files, [
			{ name: 'AGENTS.md', status: 'created' },
			{ name: 'CLAUDE.md', status: 'updated' },
		]);
		assert.include(fs.readFileSync(path.join(rootPath, 'CLAUDE.md'), 'utf-8'), 'chef help agent');
	});

	it('should leave a CLAUDE.md that imports AGENTS.md as is', async () => {
		fs.writeFileSync(path.join(rootPath, 'CLAUDE.md'), '@AGENTS.md\n');

		const result = await installAgentInstructions(rootPath);

		assert.deepEqual(result.files[1], { name: 'CLAUDE.md', status: 'imports-agents-md' });
		assert.equal(fs.readFileSync(path.join(rootPath, 'CLAUDE.md'), 'utf-8'), '@AGENTS.md\n');
	});

	it('should handle .claude/CLAUDE.md', async () => {
		fs.mkdirSync(path.join(rootPath, '.claude'));
		fs.writeFileSync(path.join(rootPath, '.claude', 'CLAUDE.md'), '# Rules\n');

		const result = await installAgentInstructions(rootPath);

		assert.deepEqual(result.files[1], { name: '.claude/CLAUDE.md', status: 'updated' });
	});

	it('should warn about CLAUDE.local.md without a shared CLAUDE.md', async () => {
		fs.writeFileSync(path.join(rootPath, 'CLAUDE.local.md'), '# Mine\n');

		const result = await installAgentInstructions(rootPath);

		assert.isTrue(result.hasLocalClaudeFileOnly);
		assert.equal(fs.readFileSync(path.join(rootPath, 'CLAUDE.local.md'), 'utf-8'), '# Mine\n');
	});

	it('should be idempotent', async () => {
		fs.writeFileSync(path.join(rootPath, 'CLAUDE.md'), '# Rules\n');
		await installAgentInstructions(rootPath);

		const result = await installAgentInstructions(rootPath);

		assert.deepEqual(result.files.map((file) => file.status), ['unchanged', 'unchanged']);
	});
});
