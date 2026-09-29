import { createRequire } from 'node:module';

import chalk from 'chalk';
import boxen from 'boxen';

const PACKAGE_NAME = '@bitrix/chef';
const OUTDATED_AFTER_MONTHS = 6;

let checked = false;

/**
 * Browser data (caniuse-lite) ships with chef, so outdated data is refreshed by updating chef.
 * Shows a notice once per run, at exit, when the latest browser release in the data is older
 * than half a year — the same threshold browserslist uses for its own warning.
 */
export function warnIfBrowserDataIsOutdated(): void
{
	if (checked)
	{
		return;
	}

	checked = true;

	if (!process.stdout.isTTY || process.env.NO_UPDATE_NOTIFIER)
	{
		return;
	}

	const monthsPassed = getBrowserDataAgeInMonths();
	if (monthsPassed < OUTDATED_AFTER_MONTHS)
	{
		return;
	}

	const message = [
		`Browser data is ${monthsPassed} months old`,
		`Run ${chalk.cyan(`npm i -g ${PACKAGE_NAME}`)} to refresh it`,
	].join('\n');

	process.on('exit', () => {
		console.log('');
		console.log(boxen(message, {
			padding: 1,
			borderStyle: 'round',
			borderColor: 'yellow',
			textAlignment: 'center',
			title: chalk.yellow.bold(' chef '),
			titleAlignment: 'center',
		}));
	});
}

function getBrowserDataAgeInMonths(): number
{
	const require = createRequire(import.meta.url);
	const { agents } = require('caniuse-lite/dist/unpacker/agents') as {
		agents: Record<string, { release_date?: Record<string, number | null> }>;
	};

	let latestRelease = 0;
	for (const agent of Object.values(agents))
	{
		for (const releaseDate of Object.values(agent.release_date ?? {}))
		{
			latestRelease = Math.max(latestRelease, releaseDate ?? 0);
		}
	}

	if (latestRelease === 0)
	{
		return 0;
	}

	const now = new Date();
	const released = new Date(latestRelease * 1000);

	return (now.getFullYear() - released.getFullYear()) * 12 + now.getMonth() - released.getMonth();
}
