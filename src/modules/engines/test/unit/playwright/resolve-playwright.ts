import * as path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import type { BrowserType } from '../../test-types';

type PlaywrightModule = {
	[key in BrowserType]?: {
		launch: (options?: Record<string, unknown>) => Promise<any>;
		launchPersistentContext?: (userDataDir: string, options?: Record<string, unknown>) => Promise<any>;
		connectOverCDP: (endpoint: string) => Promise<any>;
		executablePath: () => string;
	};
};

// The browser launchers live in `playwright`, but a project usually only declares the test
// runner. Both re-export the same launchers, and `playwright-core` is what actually owns
// the browser revisions, so any of the three gives us a Playwright whose browsers were
// installed by the project's own `npx playwright install`.
const CANDIDATE_PACKAGES = ['playwright', '@playwright/test', 'playwright-core'];

/**
 * Loads Playwright from the project rather than from chef's own node_modules.
 *
 * chef is usually installed globally, where npm resolves its caret range without a lockfile
 * and so drifts ahead of the version the project pinned. Importing `playwright` by bare
 * specifier from chef's own code picks up that newer copy, which expects browser revisions
 * nobody ever installed — the project's `npx playwright install` only covers the version the
 * project pinned. `chef test e2e` never hits this because it spawns `npx` in the project, so
 * unit runs have to reach for the project's copy the same way.
 *
 * Falls back to chef's bundled Playwright when the project declares none.
 */
export async function resolvePlaywright(projectRoot: string): Promise<PlaywrightModule>
{
	const projectRequire = createRequire(path.join(projectRoot, 'noop.js'));

	for (const packageName of CANDIDATE_PACKAGES)
	{
		let entryPoint: string;
		try
		{
			entryPoint = projectRequire.resolve(packageName);
		}
		catch
		{
			// Not installed in the project — try the next candidate.
			continue;
		}

		const playwright = await import(pathToFileURL(entryPoint).href);
		const playwrightModule: PlaywrightModule = playwright.default ?? playwright;

		// `playwright-core` always resolves, but a stripped-down build may not expose the
		// launchers. Only accept a candidate that can actually start a browser.
		if (playwrightModule.chromium)
		{
			return playwrightModule;
		}
	}

	return import('playwright');
}
