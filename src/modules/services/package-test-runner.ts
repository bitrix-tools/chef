import { UnitTestEngine } from '../engines/test/unit/unit-test-engine';
import { PlaywrightUnitStrategy } from '../engines/test/unit/playwright/playwright-unit-strategy';
import { E2ETestEngine } from '../engines/test/e2e/e2e-test-engine';
import { PlaywrightE2EStrategy } from '../engines/test/e2e/playwright/playwright-e2e-strategy';
import { Environment } from '../../environment/environment';

import type { BasePackage } from '../packages/base-package';
import type { TestResult } from '../engines/test/test-types';

export class PackageTestRunner
{
	readonly #package: BasePackage;

	constructor(extensionPackage: BasePackage)
	{
		this.#package = extensionPackage;
	}

	async runUnitTests(args: Record<string, any> = {}): Promise<TestResult>
	{
		const engine = new UnitTestEngine(new PlaywrightUnitStrategy());

		return engine.run({
			packageName: this.#package.getName(),
			packageRoot: this.#package.getPath(),
			projectRoot: Environment.getRoot(),
			publicPath: this.#package.getPublicPath(),
			targets: this.#package.getTargets(),
			typescript: this.#package.isTypeScriptMode(),
			testFiles: await this.#package.getUnitTests(),
			browserType: args.browserType,
			headed: args.headed,
			debug: args.debug,
			grep: args.grep,
			file: args.file,
			cdpPort: args.cdpPort,
			onToken: args.onToken,
			onStatus: args.onStatus,
		});
	}

	async runEndToEndTests(args: Record<string, any> = {}): Promise<TestResult>
	{
		const engine = new E2ETestEngine(new PlaywrightE2EStrategy());
		const tests = await this.#package.getEndToEndTests();

		return engine.run({
			projectRoot: Environment.getRoot(),
			testsDirectory: this.#package.getEndToEndTestsDirectoryPath(),
			hasTests: tests.length > 0,
			headed: args.headed,
			debug: args.debug,
			grep: args.grep,
			project: args.project,
			file: args.file,
			onToken: args.onToken,
			onStatus: args.onStatus,
			onBegin: args.onBegin,
		});
	}
}
