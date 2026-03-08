import * as path from 'node:path';

import type { BasePackage } from '../packages/base-package';
import type { LintResult } from '../engines/lint/lint-types';
import { LintEngine } from '../engines/lint/lint-engine';
import { ESLintStrategy } from '../engines/lint/eslint/eslint-strategy';
import { Environment } from '../../environment/environment';

export class PackageLinter
{
	readonly #package: BasePackage;

	constructor(extensionPackage: BasePackage)
	{
		this.#package = extensionPackage;
	}

	async lint(): Promise<LintResult>
	{
		const engine = new LintEngine(new ESLintStrategy());

		return engine.lint({
			sourcePath: path.join(this.#package.getPath(), 'src'),
			rootPath: Environment.getRoot(),
		});
	}
}
