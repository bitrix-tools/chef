import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import fg from 'fast-glob';

import { LintStrategy } from '../lint-strategy';
import { createPathFilter } from '../../../../utils/create-path-filter';
import { normalizePath } from '../../../../utils/path/normalize';
import { Environment } from '../../../../environment/environment';
import { IGNORED_FILES, findProjectConfig, writePresetConfig } from './oxlint-config';
import { prepareSource, shadowName } from './prepare-source';
import { runOxlint, toRuleId } from './run-oxlint';
import { TextPositions } from './text-positions';
import { carryOverEdits, diffText } from './text-diff';

import type { PreparedSource } from './prepare-source';
import type { OxlintDiagnostic } from './run-oxlint';
import type { LintOptions, LintResult, LintFileResult, LintMessage } from '../lint-types';

// Fix passes over the same files: one oxlint run applies only non-overlapping fixes.
const MAX_FIX_PASSES = 10;

type SourceFile = {
	path: string;
	text: string;
	prepared: PreparedSource;
	// where oxlint sees the file
	lintPath: string;
};

type ShadowSource = SourceFile & { prepared: Exclude<PreparedSource, { kind: 'native' | 'unparsable' }> };

type LintedFile = LintFileResult & { fixed: boolean };

function isShadow(source: SourceFile): source is ShadowSource
{
	return source.prepared.kind !== 'native' && source.prepared.kind !== 'unparsable';
}

function groupByFile(diagnostics: OxlintDiagnostic[]): Map<string, OxlintDiagnostic[]>
{
	const byFile = new Map<string, OxlintDiagnostic[]>();
	for (const diagnostic of diagnostics)
	{
		const list = byFile.get(diagnostic.filePath) ?? [];
		list.push(diagnostic);
		byFile.set(diagnostic.filePath, list);
	}

	return byFile;
}

// Formatting rules that look at text, not at syntax: ESLint applied them to Flow types too.
const TEXT_RULES = new Set([
	'eol-last',
	'linebreak-style',
	'max-len',
	'no-mixed-spaces-and-tabs',
	'no-multiple-empty-lines',
	'no-trailing-spaces',
	'spaced-comment',
]);

/**
 * A formatting diagnostic inside a Flow type annotation: ESLint did not format Flow
 * types. A missing semicolon after `type A = {...}` is reported right at its end.
 */
function isTypeFormatting(code: string | undefined, start: number, typeRanges: Array<[number, number]>): boolean
{
	const match = /^@stylistic\((.+)\)$/.exec(code ?? '');
	if (!match || TEXT_RULES.has(match[1]))
	{
		return false;
	}

	const inclusiveEnd = match[1] === 'semi';

	return typeRanges.some(([from, to]) => start >= from && (start < to || (inclusiveEnd && start === to)));
}

function toLintResult(linted: LintedFile[]): LintResult
{
	const files: LintFileResult[] = linted.map(({ filePath, messages }) => ({ filePath, messages }));
	const count = (severity: LintMessage['severity']) => files.reduce(
		(sum, file) => sum + file.messages.filter((m) => m.severity === severity).length,
		0,
	);
	const errorsCount = count('error');
	const warningsCount = count('warning');
	const fixedCount = linted.filter((file) => file.fixed).length;

	return {
		files,
		hasErrors: () => errorsCount > 0,
		getErrorsCount: () => errorsCount,
		hasWarnings: () => warningsCount > 0,
		getWarningsCount: () => warningsCount,
		getFixedCount: () => fixedCount,
	};
}

export class OxlintStrategy extends LintStrategy
{
	match(options: LintOptions): boolean
	{
		const linter = options.linter ?? process.env.CHEF_LINTER;
		if (linter === 'eslint')
		{
			return false;
		}

		return linter === 'oxlint' || findProjectConfig(options.sourcePath, options.rootPath) !== null;
	}

	async lint(options: LintOptions): Promise<LintResult>
	{
		const [result] = await this.lintMany([options]);

		return result;
	}

	/**
	 * Lints several sources in one go: one oxlint run for all of their files instead of one
	 * per source, which saves starting oxlint and loading its JS plugins every time.
	 * All requests must share `rootPath` and `fix`.
	 */
	async lintMany(requests: LintOptions[]): Promise<LintResult[]>
	{
		if (requests.length === 0)
		{
			return [];
		}

		const rootPath = requests[0].rootPath;
		const fix = requests[0].fix ?? false;
		const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'chef-oxlint-'));

		try
		{
			let presetConfig: Promise<string> | null = null;
			const configOf = (request: LintOptions): Promise<string> => {
				const projectConfig = findProjectConfig(request.sourcePath, request.rootPath);
				if (projectConfig)
				{
					return Promise.resolve(projectConfig);
				}

				presetConfig ??= writePresetConfig({
					rootPath,
					outputDir: tempDir,
					sourceRepository: Environment.getType() === 'source',
				});

				return presetConfig;
			};

			const requestFiles = await Promise.all(requests.map((request) => this.#collectFiles(request)));
			const filesByConfig = new Map<string, Set<string>>();
			for (const [i, request] of requests.entries())
			{
				const configPath = await configOf(request);
				const files = filesByConfig.get(configPath) ?? new Set<string>();
				requestFiles[i].forEach((file) => files.add(file));
				filesByConfig.set(configPath, files);
			}

			const linted = new Map<string, LintedFile>();
			for (const [index, [configPath, files]] of [...filesByConfig.entries()].entries())
			{
				const shadowRoot = path.join(tempDir, `shadow-${index}`);
				const result = await this.#lintFiles([...files].sort(), { rootPath, fix }, configPath, shadowRoot);
				result.forEach((file, filePath) => linted.set(filePath, file));
			}

			return requestFiles.map((files) => toLintResult(files.map((file) => linted.get(file)!)));
		}
		finally
		{
			await fs.promises.rm(tempDir, { recursive: true, force: true });
		}
	}

	async #collectFiles(options: LintOptions): Promise<string[]>
	{
		const patterns = options.files && options.files.length > 0
			? options.files.map((pattern) => normalizePath(pattern))
			: [`${normalizePath(options.sourcePath)}/**/*.{js,ts}`];

		const files = await fg(patterns, { absolute: true, onlyFiles: true, ignore: IGNORED_FILES, dot: false });
		const isExcluded = createPathFilter(options.exclude?.map((p) => path.resolve(p)) ?? []);

		return files.filter((file) => !isExcluded(path.resolve(file))).sort();
	}

	async #lintFiles(
		paths: string[],
		options: { rootPath: string; fix: boolean },
		configPath: string,
		shadowRoot: string,
	): Promise<Map<string, LintedFile>>
	{
		const { rootPath, fix } = options;
		const toSource = (filePath: string, text: string): SourceFile => {
			const prepared = prepareSource(filePath, text);
			const relative = path.relative(rootPath, filePath);
			const shadowRelative = relative.startsWith('..') ? path.basename(filePath) : relative;

			return {
				path: filePath,
				text,
				prepared,
				lintPath: prepared.kind === 'native' || prepared.kind === 'unparsable'
					? filePath
					: path.join(shadowRoot, shadowName(shadowRelative, prepared)),
			};
		};
		const writeShadow = async (source: SourceFile) => {
			if (isShadow(source))
			{
				await fs.promises.mkdir(path.dirname(source.lintPath), { recursive: true });
				await fs.promises.writeFile(source.lintPath, source.prepared.text);
			}
		};

		let sources: SourceFile[] = await Promise.all(paths.map(async (filePath) => {
			return toSource(filePath, await fs.promises.readFile(filePath, 'utf8'));
		}));
		await Promise.all(sources.map(writeShadow));

		const lintRun = (list: SourceFile[]) => this.#lint(list, rootPath, shadowRoot, configPath);
		const fixed = new Set<string>();
		let diagnostics: Map<string, OxlintDiagnostic[]>;

		if (!fix)
		{
			diagnostics = await lintRun(sources);
		}
		else
		{
			// Native files are fixed in place; Flow files are fixed in their shadow copies and
			// the result is carried over to the originals. Type-stripped copies are never fixed:
			// blanked types make fixes unsafe.
			const native = sources.filter((s) => s.prepared.kind === 'native');
			const fixableShadow = sources.filter((s): s is ShadowSource => isShadow(s) && s.prepared.kind !== 'stripped');
			const [nativeDiagnostics] = await Promise.all([
				this.#fixUntilStable(native.map((s) => s.path), rootPath, configPath),
				this.#fixUntilStable(fixableShadow.map((s) => s.lintPath), shadowRoot, configPath),
			]);

			const relint: SourceFile[] = sources.filter((s) => s.prepared.kind === 'stripped');
			sources = await Promise.all(sources.map(async (source) => {
				if (source.prepared.kind === 'native')
				{
					if (await fs.promises.readFile(source.path, 'utf8') !== source.text)
					{
						fixed.add(source.path);
					}

					return source;
				}

				if (!isShadow(source) || source.prepared.kind === 'stripped')
				{
					return source;
				}

				const after = await fs.promises.readFile(source.lintPath, 'utf8');
				const carried = after === source.prepared.text
					? null
					: carryOverEdits(
						source.text,
						diffText(source.prepared.text, after),
						source.prepared.changed,
						source.prepared.kind === 'flow-as-ts' ? source.prepared.typeRanges : [],
					);

				let updated: SourceFile = source;
				if (carried && carried.text !== source.text)
				{
					await fs.promises.writeFile(source.path, carried.text);
					fixed.add(source.path);
					updated = toSource(source.path, carried.text);
				}

				// positions in the fixed shadow copy no longer match the original: lint again
				await writeShadow(updated);
				relint.push(updated);

				return updated;
			}));

			diagnostics = new Map([...nativeDiagnostics, ...await lintRun(relint)]);
		}

		const files = new Map<string, LintedFile>();
		for (const source of sources)
		{
			if (source.prepared.kind === 'unparsable')
			{
				const { line, column } = new TextPositions(source.text).locationOf(source.prepared.offset);
				files.set(source.path, {
					filePath: source.path,
					messages: [{ line, column, severity: 'error', message: `Parsing error: ${source.prepared.message}`, ruleId: null }],
					fixed: false,
				});
				continue;
			}

			// fixed native files are reported against their new text
			const text = source.prepared.kind === 'native' && fixed.has(source.path)
				? await fs.promises.readFile(source.path, 'utf8')
				: source.text;

			files.set(source.path, {
				filePath: source.path,
				messages: this.#toMessages(
					diagnostics.get(source.lintPath) ?? [],
					text,
					isShadow(source) ? source.prepared.changed : [],
					source.prepared.kind === 'flow-as-ts' ? source.prepared.typeRanges : [],
				),
				fixed: fixed.has(source.path),
			});
		}

		return files;
	}

	/**
	 * Lints native files in place and the others in their shadow copies.
	 */
	async #lint(sources: SourceFile[], rootPath: string, shadowRoot: string, configPath: string): Promise<Map<string, OxlintDiagnostic[]>>
	{
		const native = sources.filter((s) => s.prepared.kind === 'native').map((s) => s.lintPath);
		const shadow = sources.filter(isShadow).map((s) => s.lintPath);
		const results = await Promise.all([
			native.length > 0 ? runOxlint({ cwd: rootPath, configPath, files: native, fix: false }) : [],
			shadow.length > 0 ? runOxlint({ cwd: shadowRoot, configPath, files: shadow, fix: false }) : [],
		]);

		return groupByFile(results.flat());
	}

	/**
	 * Runs `--fix` until the files stop changing. Diagnostics of a file come from the run
	 * that left it unchanged, so their positions match its final text.
	 */
	async #fixUntilStable(files: string[], cwd: string, configPath: string): Promise<Map<string, OxlintDiagnostic[]>>
	{
		const result = new Map<string, OxlintDiagnostic[]>();
		let pending = files;
		for (let pass = 0; pass < MAX_FIX_PASSES && pending.length > 0; pass++)
		{
			const before = await Promise.all(pending.map((file) => fs.promises.readFile(file, 'utf8')));
			const diagnostics = groupByFile(await runOxlint({ cwd, configPath, files: pending, fix: true }));
			const next: string[] = [];
			for (const [i, file] of pending.entries())
			{
				if (await fs.promises.readFile(file, 'utf8') === before[i])
				{
					result.set(file, diagnostics.get(file) ?? []);
				}
				else
				{
					next.push(file);
				}
			}
			pending = next;
		}

		if (pending.length > 0)
		{
			const diagnostics = groupByFile(await runOxlint({ cwd, configPath, files: pending, fix: false }));
			for (const file of pending)
			{
				result.set(file, diagnostics.get(file) ?? []);
			}
		}

		return result;
	}

	/**
	 * Diagnostics at or right next to transformed positions describe the transformation (a
	 * blanked `?` makes a double space, a blanked type leaves a space before a comma), not
	 * the code, and are dropped. So are formatting diagnostics inside Flow type annotations
	 * (`typeRanges`): ESLint did not format Flow types.
	 */
	#toMessages(diagnostics: OxlintDiagnostic[], text: string, changed: number[], typeRanges: Array<[number, number]> = []): LintMessage[]
	{
		const positions = new TextPositions(text);
		const changedSorted = [...changed].sort((a, b) => a - b);
		// is there a changed position within [start, end]?
		const touchesChange = (start: number, end: number) => {
			let low = 0;
			let high = changedSorted.length;
			while (low < high)
			{
				const middle = (low + high) >> 1;
				if (changedSorted[middle] < start)
				{
					low = middle + 1;
				}
				else
				{
					high = middle;
				}
			}

			return low < changedSorted.length && changedSorted[low] <= end;
		};

		const messages: LintMessage[] = [];
		for (const diagnostic of diagnostics)
		{
			const start = positions.indexOfByteOffset(diagnostic.offset);
			const end = positions.indexOfByteOffset(diagnostic.offset + diagnostic.length);
			if (diagnostic.code && touchesChange(start - 1, end))
			{
				continue;
			}

			if (isTypeFormatting(diagnostic.code, start, typeRanges))
			{
				continue;
			}

			const { line, column } = positions.locationOf(start);
			messages.push({
				line,
				column,
				severity: diagnostic.severity === 'error' ? 'error' : 'warning',
				message: diagnostic.message,
				ruleId: toRuleId(diagnostic.code),
			});
		}

		return messages.sort((a, b) => a.line - b.line || a.column - b.column);
	}
}
