import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import fg from 'fast-glob';

import { LintStrategy } from '../lint-strategy';
import { createPathFilter } from '../../../../utils/create-path-filter';
import { normalizePath } from '../../../../utils/path/normalize';
import { Environment } from '../../../../environment/environment';
import { TransformationArtifacts } from './artifacts';
import { IGNORED_FILES, createProjectIgnoreFilter, findProjectConfig, writePresetConfig } from './oxlint-config';
import { prepareSource, shadowName } from './prepare-source';
import { FILES_PER_RUN, PARALLEL_RUNS, runOxlint, toRuleId } from './run-oxlint';
import { TextPositions } from './text-positions';
import { carryOverEdits, diffText } from './text-diff';

import type { PreparedSource } from './prepare-source';
import type { OxlintDiagnostic } from './run-oxlint';
import type { LintOptions, LintResult, LintFileResult, LintMessage } from '../lint-types';

// Fix passes over the same files: one oxlint run applies only non-overlapping fixes.
const MAX_FIX_PASSES = 10;

// A batch sends sources to oxlint in groups of files: small ones first, so that the first
// results come soon, then twice as large each time, up to the files of one oxlint run.
const FIRST_GROUP_FILES = 50;

type SourceFile = {
	path: string;
	text: string;
	prepared: PreparedSource;
	// where oxlint sees the file
	lintPath: string;
};

type ShadowSource = SourceFile & { prepared: Exclude<PreparedSource, { kind: 'native' | 'unparsable' }> };

type LintedFile = LintFileResult & { fixed: boolean };

export type LintBatch = {
	add(request: LintOptions): Promise<LintResult>;
	close(): void;
};

type GroupItem = {
	request: LintOptions;
	// the files to lint, ignored ones left out
	files: string[];
	configPath: string;
	resolve: (result: LintResult) => void;
	reject: (error: unknown) => void;
};

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
	// oxlint is the default linter; ESLint only on request
	match(options: LintOptions): boolean
	{
		return (options.linter ?? process.env.CHEF_LINTER) !== 'eslint';
	}

	async lint(options: LintOptions): Promise<LintResult>
	{
		const [result] = await this.lintMany([options]);

		return result;
	}

	/**
	 * Lints several sources in batches (see `createBatch`).
	 * All requests must share `rootPath` and `fix`.
	 */
	async lintMany(requests: LintOptions[]): Promise<LintResult[]>
	{
		const batch = this.createBatch();
		const results = requests.map((request) => batch.add(request));
		batch.close();

		return Promise.all(results);
	}

	/**
	 * Lints the sources added to it as they come. Sources are grouped by files (see
	 * `FIRST_GROUP_FILES`), and a group goes to oxlint as soon as it is full, several groups at
	 * a time: one oxlint run per group instead of one per source saves starting oxlint and
	 * loading its JS plugins every time, and the first results come before the last sources
	 * are added.
	 * The result of a source settles when its group is linted. All sources must share
	 * `rootPath` and `fix`; `close()` tells that no more sources come.
	 */
	createBatch(): LintBatch
	{
		let tempDir: Promise<string> | null = null;
		const tempDirOf = () => {
			tempDir ??= fs.promises.mkdtemp(path.join(os.tmpdir(), 'chef-oxlint-'));

			return tempDir;
		};

		// project config -> its ignorePatterns as a filter
		const ignoreFilters = new Map<string, Promise<(filePath: string) => boolean>>();
		let presetConfig: Promise<string> | null = null;
		const configOf = async (request: LintOptions): Promise<string> => {
			const projectConfig = findProjectConfig(request.sourcePath, request.rootPath);
			if (projectConfig)
			{
				if (!ignoreFilters.has(projectConfig))
				{
					ignoreFilters.set(projectConfig, createProjectIgnoreFilter(projectConfig));
				}

				return projectConfig;
			}

			presetConfig ??= tempDirOf().then((outputDir) => writePresetConfig({
				outputDir,
				sourceRepository: Environment.getType() === 'source',
			}));

			return presetConfig;
		};

		let group: GroupItem[] = [];
		let groupFiles = 0;
		let groupLimit = FIRST_GROUP_FILES;
		let groupCount = 0;
		const queue: GroupItem[][] = [];
		let running = 0;
		let closed = false;

		const removeTempDir = () => {
			if (closed && running === 0 && queue.length === 0 && tempDir)
			{
				const dir = tempDir;
				tempDir = null;
				void dir.then((d) => fs.promises.rm(d, { recursive: true, force: true }));
			}
		};
		const launch = () => {
			while (running < PARALLEL_RUNS && queue.length > 0)
			{
				const items = queue.shift()!;
				const index = groupCount++;
				running++;
				void this.#lintGroup(items, tempDirOf, index).finally(() => {
					running--;
					launch();
					removeTempDir();
				});
			}
		};
		const flush = () => {
			if (group.length > 0)
			{
				queue.push(group);
				group = [];
				groupFiles = 0;
				groupLimit = Math.min(groupLimit * 2, FILES_PER_RUN);
				launch();
			}
		};

		// sources are grouped in the order they are added
		let adding: Promise<void> = Promise.resolve();

		return {
			add: (request: LintOptions): Promise<LintResult> => new Promise((resolve, reject) => {
				adding = adding.then(async () => {
					try
					{
						const configPath = await configOf(request);
						const ignored = await (ignoreFilters.get(configPath) ?? (() => false));
						const files = (await this.#collectFiles(request)).filter((file) => !ignored(file));
						if (files.length === 0)
						{
							resolve(toLintResult([]));

							return;
						}

						group.push({ request, files, configPath, resolve, reject });
						groupFiles += files.length;
						if (groupFiles >= groupLimit)
						{
							flush();
						}
					}
					catch (error)
					{
						reject(error);
					}
				});
			}),
			close: () => {
				adding = adding.then(() => {
					flush();
					closed = true;
					removeTempDir();
				});
			},
		};
	}

	async #lintGroup(items: GroupItem[], tempDirOf: () => Promise<string>, index: number): Promise<void>
	{
		try
		{
			const { rootPath } = items[0].request;
			const fix = items[0].request.fix ?? false;
			const tempDir = await tempDirOf();

			const filesByConfig = new Map<string, Set<string>>();
			for (const { files, configPath } of items)
			{
				const configFiles = filesByConfig.get(configPath) ?? new Set<string>();
				files.forEach((file) => configFiles.add(file));
				filesByConfig.set(configPath, configFiles);
			}

			const linted = new Map<string, LintedFile>();
			for (const [configIndex, [configPath, files]] of [...filesByConfig.entries()].entries())
			{
				const shadowRoot = path.join(tempDir, `shadow-${index}-${configIndex}`);
				const result = await this.#lintFiles([...files].sort(), { rootPath, fix }, configPath, shadowRoot);
				result.forEach((file, filePath) => linted.set(filePath, file));
			}

			items.forEach(({ files, resolve }) => resolve(toLintResult(files.map((file) => linted.get(file)!))));
		}
		catch (error)
		{
			items.forEach(({ reject }) => reject(error));
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

			// fixed native files are reported against their new text, shadow copies against
			// the text oxlint saw (same length and lines as the original)
			let text = source.text;
			if (isShadow(source))
			{
				text = source.prepared.text;
			}
			else if (fixed.has(source.path))
			{
				text = await fs.promises.readFile(source.path, 'utf8');
			}

			files.set(source.path, {
				filePath: source.path,
				messages: this.#toMessages(
					diagnostics.get(source.lintPath) ?? [],
					text,
					isShadow(source) ? new TransformationArtifacts(source.text, source.prepared) : null,
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
	 * Diagnostics of a shadow copy that describe the transformation are dropped (see
	 * TransformationArtifacts).
	 */
	#toMessages(diagnostics: OxlintDiagnostic[], text: string, artifacts: TransformationArtifacts | null): LintMessage[]
	{
		const positions = new TextPositions(text);
		const messages: LintMessage[] = [];
		for (const diagnostic of diagnostics)
		{
			const start = positions.indexOfByteOffset(diagnostic.offset);
			const end = positions.indexOfByteOffset(diagnostic.offset + diagnostic.length);
			if (artifacts?.has(diagnostic.code, start, end))
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
