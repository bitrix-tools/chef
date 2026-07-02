import * as path from 'node:path';
import * as fs from 'node:fs';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

import { BuildEngine } from '../../src/modules/engines/build/build-engine';
import { RollupBuildStrategy } from '../../src/modules/engines/build/rollup/rollup-strategy';
import { BundleConfigManager } from '../../src/modules/config/bundle/bundle-config-manager';

import type { BuildOptions } from '../../src/modules/engines/build/build-types';

const fixturesRoot = path.resolve(import.meta.dirname, '../fixtures/source-repo/ui/install/js/ui');

type Fixture = {
	label: string;
	dir: string;
	bundleFile: string;
	className: string;
	// The source has leading comments and indentation; these are the lines where the class
	// and the `return this.value` live, so the map must resolve to them regardless of the
	// line/column shifts introduced by strip-comments, tab-indent, terser, etc.
	classSourceLine: number;
	returnSourceLine: number;
};

const JS_FIXTURE: Fixture = {
	label: 'JavaScript',
	dir: path.join(fixturesRoot, 'sourcemap-offset-extension'),
	bundleFile: 'sourcemap-offset-extension.bundle.js',
	className: 'SourcemapOffsetExtension',
	classSourceLine: 8,
	returnSourceLine: 16,
};

const TS_FIXTURE: Fixture = {
	label: 'TypeScript',
	dir: path.join(fixturesRoot, 'sourcemap-offset-ts-extension'),
	bundleFile: 'sourcemap-offset-ts-extension.bundle.js',
	className: 'SourcemapOffsetTsExtension',
	classSourceLine: 8,
	returnSourceLine: 15,
};

function cleanDist(fixture: Fixture): void
{
	const distPath = path.join(fixture.dir, 'dist');
	if (fs.existsSync(distPath))
	{
		fs.rmSync(distPath, { recursive: true });
	}
}

function getBuildOptions(fixture: Fixture, overrides: Partial<BuildOptions> = {}): BuildOptions
{
	const config = new BundleConfigManager();
	config.loadFromFile(path.join(fixture.dir, 'bundle.config.js'));

	const input = config.get('input');

	return {
		input: path.join(fixture.dir, input),
		output: {
			js: path.join(fixture.dir, config.get('output').js),
			css: path.join(fixture.dir, config.get('output').css),
		},
		packageRoot: fixture.dir,
		publicPath: '/test/',
		targets: [],
		namespace: config.get('namespace'),
		typescript: input.endsWith('.ts'),
		sourceMaps: true,
		...overrides,
	};
}

/**
 * Finds the first line in `bundleLines` containing `needle`, then walks its columns until
 * a mapping resolves and returns the original source line it points to. Column-walking is
 * needed because the exact mapped column depends on indentation (tabs) and minification.
 */
function originalLineFor(bundleLines: string[], map: TraceMap, needle: string): number | null
{
	const bundleLine = bundleLines.findIndex((line) => line.includes(needle));
	if (bundleLine === -1)
	{
		return null;
	}

	for (let column = 0; column < bundleLines[bundleLine].length; column++)
	{
		const position = originalPositionFor(map, { line: bundleLine + 1, column });
		if (position.line !== null)
		{
			return position.line;
		}
	}

	return null;
}

describe('build sourcemap', () => {
	let buildService: BuildEngine;

	beforeEach(() => {
		buildService = new BuildEngine(new RollupBuildStrategy());
	});

	async function buildAndTrace(fixture: Fixture, overrides: Partial<BuildOptions> = {}): Promise<{
		classLine: number | null;
		returnLine: number | null;
	}>
	{
		const result = await buildService.build(getBuildOptions(fixture, overrides));
		assert.isEmpty(result.errors, `build errors: ${JSON.stringify(result.errors)}`);

		const jsPath = path.join(fixture.dir, 'dist', fixture.bundleFile);
		const mapPath = `${jsPath}.map`;
		assert.isTrue(fs.existsSync(mapPath), 'source map should exist');

		const bundleLines = fs.readFileSync(jsPath, 'utf-8').split('\n');
		const map = new TraceMap(JSON.parse(fs.readFileSync(mapPath, 'utf-8')));

		return {
			classLine: originalLineFor(bundleLines, map, fixture.className),
			returnLine: originalLineFor(bundleLines, map, 'return this.value'),
		};
	}

	for (const fixture of [JS_FIXTURE, TS_FIXTURE])
	{
		describe(fixture.label, () => {
			beforeEach(() => cleanDist(fixture));
			afterEach(() => cleanDist(fixture));

			it('maps positions to the correct source lines (default build)', async () => {
				const { classLine, returnLine } = await buildAndTrace(fixture);

				assert.equal(classLine, fixture.classSourceLine, 'class should map to its source line');
				assert.equal(returnLine, fixture.returnSourceLine, 'return should map to its source line');
			});

			it('maps positions correctly with minification', async () => {
				const { classLine } = await buildAndTrace(fixture, { minify: true });

				// Minified code is single-line, but the class name must still map to its line.
				assert.equal(classLine, fixture.classSourceLine, 'class should map to its source line after minification');
			});

			it('maps positions correctly with safeNamespaces', async () => {
				const { classLine, returnLine } = await buildAndTrace(fixture, { safeNamespaces: true });

				assert.equal(classLine, fixture.classSourceLine, 'class should map to its source line');
				assert.equal(returnLine, fixture.returnSourceLine, 'return should map to its source line');
			});
		});
	}
});
