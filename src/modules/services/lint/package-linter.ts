import * as path from 'node:path';

import type { BasePackage } from '../../packages/base-package';
import { LintResult } from '../../linter/lint.result';
import { Environment } from '../../../environment/environment';

export class PackageLinter
{
	readonly #package: BasePackage;

	constructor(extensionPackage: BasePackage)
	{
		this.#package = extensionPackage;
	}

	async lint(): Promise<LintResult>
	{
		const { ESLint } = await import('eslint');

		const eslint = new ESLint({
			errorOnUnmatchedPattern: false,
			cwd: Environment.getRoot(),
		});

		const results = await eslint.lintFiles(
			path.join(this.#package.getPath(), 'src', '**/*.js'),
		);

		return new LintResult({
			results,
		});
	}
}
