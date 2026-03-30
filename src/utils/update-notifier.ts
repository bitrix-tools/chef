import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';

import chalk from 'chalk';
import boxen from 'boxen';

import { getChefVersion } from './chef-version';

const PACKAGE_NAME = '@bitrix/chef';
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_FILE = path.join(os.tmpdir(), 'chef-update-check.json');

interface UpdateCache
{
	lastCheck: number;
	latestVersion: string;
}

function readCache(): UpdateCache | null
{
	try
	{
		const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
		if (data && typeof data.lastCheck === 'number' && typeof data.latestVersion === 'string')
		{
			return data;
		}
	}
	catch
	{
		// ignore
	}

	return null;
}

function writeCache(cache: UpdateCache): void
{
	try
	{
		fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf-8');
	}
	catch
	{
		// ignore
	}
}

function fetchLatestVersion(): void
{
	const npmPath = process.platform === 'win32' ? 'npm.cmd' : 'npm';

	execFile(npmPath, ['view', PACKAGE_NAME, 'version'], {
		timeout: 10_000,
		env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
	}, (error, stdout) => {
		if (error)
		{
			return;
		}

		const version = stdout.trim();
		if (version && /^\d+\.\d+\.\d+/.test(version))
		{
			writeCache({ lastCheck: Date.now(), latestVersion: version });
		}
	});
}

function isNewerVersion(current: string, latest: string): boolean
{
	const [cMajor, cMinor, cPatch] = current.split('.').map(Number);
	const [lMajor, lMinor, lPatch] = latest.split('.').map(Number);

	if (lMajor !== cMajor)
	{
		return lMajor > cMajor;
	}

	if (lMinor !== cMinor)
	{
		return lMinor > cMinor;
	}

	return lPatch > cPatch;
}

/**
 * Checks for updates in background and shows a notification if a newer version is available.
 * Call at CLI startup — it is non-blocking.
 */
export function checkForUpdates(): void
{
	if (!process.stdout.isTTY || process.env.NO_UPDATE_NOTIFIER)
	{
		return;
	}

	const currentVersion = getChefVersion();
	const cache = readCache();

	if (cache && isNewerVersion(currentVersion, cache.latestVersion))
	{
		showUpdateNotification(currentVersion, cache.latestVersion);
	}

	if (!cache || Date.now() - cache.lastCheck > CHECK_INTERVAL)
	{
		fetchLatestVersion();
	}
}

function showUpdateNotification(currentVersion: string, latestVersion: string): void
{
	const current = chalk.dim(currentVersion);
	const latest = chalk.green.bold(latestVersion);
	const command = chalk.cyan(`npm i -g ${PACKAGE_NAME}`);

	const message = [
		`Update available ${current} → ${latest}`,
		`Run ${command} to update`,
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
