import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { loadTsConfig } from '../../src/utils/load-tsconfig';

async function writeJson(filePath: string, content: unknown): Promise<void>
{
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, JSON.stringify(content, null, 4));
}

describe('loadTsConfig', () => {
	let tmpDir: string;
	let packageRoot: string;

	beforeEach(async () => {
		tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'chef-tsconfig-')));
		packageRoot = path.join(tmpDir, 'ui', 'install', 'js', 'ui', 'buttons');
		await fs.mkdir(packageRoot, { recursive: true });
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true });
	});

	it('should resolve paths against the aliases file when there is no baseUrl', async () => {
		await writeJson(path.join(tmpDir, 'aliases.tsconfig.json'), {
			compilerOptions: {
				paths: { 'main.core': ['./main/install/js/main/core/src/core.ts'] },
			},
		});
		await writeJson(path.join(tmpDir, 'tsconfig.json'), { extends: './aliases.tsconfig.json' });

		const config = await loadTsConfig(path.join(tmpDir, 'tsconfig.json'), packageRoot);

		assert.deepEqual(config.options.paths, {
			'main.core': [path.join(tmpDir, 'main/install/js/main/core/src/core.ts')],
		});
	});

	it('should resolve paths against the aliases file when loaded from a nested tsconfig', async () => {
		await writeJson(path.join(tmpDir, 'aliases.tsconfig.json'), {
			compilerOptions: {
				paths: { 'main.core': ['./main/install/js/main/core/src/core.ts'] },
			},
		});
		await writeJson(path.join(tmpDir, 'tsconfig.json'), { extends: './aliases.tsconfig.json' });
		await writeJson(path.join(packageRoot, 'tsconfig.json'), { extends: '../../../../../tsconfig.json' });

		const config = await loadTsConfig(path.join(packageRoot, 'tsconfig.json'), packageRoot);

		assert.deepEqual(config.options.paths, {
			'main.core': [path.join(tmpDir, 'main/install/js/main/core/src/core.ts')],
		});
	});

	it('should resolve paths against baseUrl and drop it from the options', async () => {
		await writeJson(path.join(tmpDir, 'aliases.tsconfig.json'), {
			compilerOptions: {
				baseUrl: './main',
				paths: { 'main.core': ['./install/js/main/core/src/core.ts'] },
			},
		});
		await writeJson(path.join(tmpDir, 'tsconfig.json'), { extends: './aliases.tsconfig.json' });

		const config = await loadTsConfig(path.join(tmpDir, 'tsconfig.json'), packageRoot);

		assert.deepEqual(config.options.paths, {
			'main.core': [path.join(tmpDir, 'main/install/js/main/core/src/core.ts')],
		});
		assert.notProperty(config.options, 'baseUrl');
	});
});
