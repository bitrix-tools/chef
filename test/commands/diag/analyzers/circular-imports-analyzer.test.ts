import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { assert } from 'chai';

import { findCircularImports } from '../../../../src/commands/diag/analyzers/circular-imports-analyzer';

describe('findCircularImports', () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chef-circular-'));
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true });
	});

	async function writeFile(name: string, content: string): Promise<string>
	{
		const filePath = path.join(tmpDir, name);
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, content);

		return filePath;
	}

	it('should detect direct circular import (A -> B -> A)', async () => {
		const fileA = await writeFile('a.js', "import { B } from './b';");
		const fileB = await writeFile('b.js', "import { A } from './a';");

		const cycles = await findCircularImports([fileA, fileB], tmpDir);

		assert.equal(cycles.length, 1);
		assert.include(cycles[0].join(' → '), 'a.js');
		assert.include(cycles[0].join(' → '), 'b.js');
	});

	it('should detect longer cycle (A -> B -> C -> A)', async () => {
		const fileA = await writeFile('a.js', "import { B } from './b';");
		const fileB = await writeFile('b.js', "import { C } from './c';");
		const fileC = await writeFile('c.js', "import { A } from './a';");

		const cycles = await findCircularImports([fileA, fileB, fileC], tmpDir);

		assert.isAbove(cycles.length, 0);
	});

	it('should return empty when no cycles', async () => {
		const fileA = await writeFile('a.js', "import { B } from './b';");
		const fileB = await writeFile('b.js', "export const B = 1;");

		const cycles = await findCircularImports([fileA, fileB], tmpDir);

		assert.equal(cycles.length, 0);
	});

	it('should ignore non-relative imports', async () => {
		const fileA = await writeFile('a.js', "import { Core } from 'main.core';");

		const cycles = await findCircularImports([fileA], tmpDir);

		assert.equal(cycles.length, 0);
	});

	it('should handle imports in comments', async () => {
		const fileA = await writeFile('a.js', "// import { B } from './b';\nexport const A = 1;");
		const fileB = await writeFile('b.js', "import { A } from './a';");

		const cycles = await findCircularImports([fileA, fileB], tmpDir);

		assert.equal(cycles.length, 0);
	});

	it('should resolve imports without extension', async () => {
		const fileA = await writeFile('a.ts', "import { B } from './b';");
		const fileB = await writeFile('b.ts', "import { A } from './a';");

		const cycles = await findCircularImports([fileA, fileB], tmpDir);

		assert.equal(cycles.length, 1);
	});

	it('should handle export ... from syntax', async () => {
		const fileA = await writeFile('a.js', "export { B } from './b';");
		const fileB = await writeFile('b.js', "export { A } from './a';");

		const cycles = await findCircularImports([fileA, fileB], tmpDir);

		assert.equal(cycles.length, 1);
	});

	it('should deduplicate cycles', async () => {
		const fileA = await writeFile('a.js', "import { B } from './b';");
		const fileB = await writeFile('b.js', "import { A } from './a';");

		const cycles = await findCircularImports([fileA, fileB], tmpDir);

		// A -> B -> A is same cycle as B -> A -> B
		assert.equal(cycles.length, 1);
	});

	it('should return relative paths', async () => {
		const fileA = await writeFile('src/a.js', "import { B } from './b';");
		const fileB = await writeFile('src/b.js', "import { A } from './a';");

		const cycles = await findCircularImports([fileA, fileB], tmpDir);

		assert.equal(cycles.length, 1);
		for (const segment of cycles[0])
		{
			assert.isFalse(path.isAbsolute(segment));
		}
	});
});
