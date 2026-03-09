import type { BasePackage } from '../packages/base-package';
import type { TestResult } from '../engines/test/test-types';
import { TestEngine } from '../engines/test/test-engine';
import { PlaywrightStrategy } from '../engines/test/playwright/playwright-strategy';
import { Environment } from '../../environment/environment';

export class PackageTestRunner
{
	readonly #package: BasePackage;

	constructor(extensionPackage: BasePackage)
	{
		this.#package = extensionPackage;
	}

	async runUnitTests(args: Record<string, any> = {}): Promise<TestResult>
	{
		const engine = new TestEngine(new PlaywrightStrategy());

		return engine.runUnitTests({
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
			onToken: args.onToken,
			onStatus: args.onStatus,
		});
	}

	async runEndToEndTests(args: Record<string, any> = {}): Promise<TestResult>
	{
		const engine = new TestEngine(new PlaywrightStrategy());
		const tests = await this.#package.getEndToEndTests();

		return engine.runEndToEndTests({
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
