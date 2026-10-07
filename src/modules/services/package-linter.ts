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

export class PackageLinter
{
	// results linted ahead by `prefetch`, by package path
	static readonly #prefetched = new Map<string, { optionsKey: string; result: LintResult }>();

	readonly #package: BasePackage;

	constructor(extensionPackage: BasePackage)
	{
		this.#package = extensionPackage;
	}

	/**
	 * Lints several packages ahead in one batch when they are linted with oxlint, which
	 * starts once for all of them instead of once per package. `lint()` then returns the
	 * prepared result. Does nothing for ESLint, which is reused in-process anyway.
	 */
	static async prefetch(items: Array<{ extensionPackage: BasePackage; options: PackageLinterOptions }>): Promise<void>
	{
		if (items.length < 2)
		{
			return;
		}

		const strategy = new OxlintStrategy();
		const requests = items.map(({ extensionPackage, options }) => new PackageLinter(extensionPackage).#request(options));
		if (!requests.every((request) => strategy.match(request)))
		{
			return;
		}

		const results = await strategy.lintMany(requests);
		for (const [i, { extensionPackage, options }] of items.entries())
		{
			PackageLinter.#prefetched.set(extensionPackage.getPath(), { optionsKey: JSON.stringify(options), result: results[i] });
		}
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
