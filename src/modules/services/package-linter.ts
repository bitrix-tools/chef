import * as path from 'node:path';

import { LintEngine } from '../engines/lint/lint-engine';
import { ESLintStrategy } from '../engines/lint/eslint/eslint-strategy';
import { OxlintStrategy } from '../engines/lint/oxlint/oxlint-strategy';
import { Environment } from '../../environment/environment';

import type { BasePackage } from '../packages/base-package';
import type { LintOptions, LintResult, LinterName } from '../engines/lint/lint-types';

type PackageLinterOptions = {
	fix?: boolean;
	files?: string[];
	cache?: boolean;
	exclude?: string[];
	linter?: LinterName;
};

export type PackageLintBatch = {
	add(extensionPackage: BasePackage, options: PackageLinterOptions): void;
	close(): void;
};

export class PackageLinter
{
	// results of the packages added to a batch, by package path
	static readonly #prefetched = new Map<string, { optionsKey: string; result: Promise<LintResult> }>();

	readonly #package: BasePackage;

	constructor(extensionPackage: BasePackage)
	{
		this.#package = extensionPackage;
	}

	/**
	 * Starts a batch that lints the packages added to it with oxlint, in groups and as they
	 * come (see `OxlintStrategy.createBatch`); `lint()` of an added package then returns its
	 * result from the batch. Null for ESLint, which lints package by package and is reused
	 * in-process anyway.
	 */
	static startBatch(linter?: LinterName): PackageLintBatch | null
	{
		const strategy = new OxlintStrategy();
		if (!strategy.match({ sourcePath: '', rootPath: '', linter }))
		{
			return null;
		}

		const batch = strategy.createBatch();

		return {
			add: (extensionPackage, options) => {
				const result = batch.add(new PackageLinter(extensionPackage).#request(options));
				// a failure is reported by `lint()` of the package
				result.catch(() => {});
				PackageLinter.#prefetched.set(extensionPackage.getPath(), { optionsKey: JSON.stringify(options), result });
			},
			close: () => batch.close(),
		};
	}

	/**
	 * Starts linting several packages ahead in one batch (see `startBatch`).
	 */
	static async prefetch(items: Array<{ extensionPackage: BasePackage; options: PackageLinterOptions }>): Promise<void>
	{
		const linters = new Set(items.map(({ options }) => options.linter));
		const batch = items.length > 1 && linters.size === 1 ? PackageLinter.startBatch([...linters][0]) : null;
		if (!batch)
		{
			return;
		}

		items.forEach(({ extensionPackage, options }) => batch.add(extensionPackage, options));
		batch.close();
	}

	async lint(options: PackageLinterOptions = {}): Promise<LintResult>
	{
		const prefetched = PackageLinter.#prefetched.get(this.#package.getPath());
		if (prefetched && prefetched.optionsKey === JSON.stringify(options))
		{
			PackageLinter.#prefetched.delete(this.#package.getPath());

			return prefetched.result;
		}

		const engine = new LintEngine([
			new OxlintStrategy(),
			new ESLintStrategy(),
		]);

		return engine.lint(this.#request(options));
	}

	#request(options: PackageLinterOptions): LintOptions
	{
		return {
			sourcePath: path.join(this.#package.getPath(), 'src'),
			rootPath: Environment.getRoot(),
			fix: options.fix,
			files: options.files,
			cache: options.cache,
			exclude: [
				this.#package.getOutputJsPath(),
				this.#package.getOutputCssPath(),
				...(options.exclude ?? []),
			],
			linter: options.linter,
		};
	}
}
