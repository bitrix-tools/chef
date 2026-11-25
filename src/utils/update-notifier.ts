import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawn } from 'node:child_process';

import chalk from 'chalk';
import boxen from 'boxen';

import { getChefVersion } from './chef-version';

const PACKAGE_NAME = '@bitrix/chef';
const UPDATE_COMMAND = `npm i -g ${PACKAGE_NAME}`;
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_CACHE_FILE = path.join(os.tmpdir(), 'chef-update-check.json');

// Asks the registry for the latest version and writes the cache. Runs as a detached process,
// so the check completes even when chef itself exits right away (e.g. `chef --version`).
const REFRESH_SCRIPT = `
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const [cacheFile, packageName] = process.argv.slice(1);
const isWindows = process.platform === 'win32';
execFile(isWindows ? 'npm.cmd' : 'npm', ['view', packageName, 'version'], {
	timeout: 10000,
	env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
	shell: isWindows,
	windowsHide: true,
}, (error, stdout) => {
	const version = error ? '' : String(stdout).trim();
	if (/^\\d+\\.\\d+\\.\\d+/.test(version)) {
		try {
			fs.writeFileSync(cacheFile, JSON.stringify({ lastCheck: Date.now(), latestVersion: version }), 'utf-8');
		} catch {}
	}
});
`;

interface UpdateCache
{
	lastCheck: number;
	latestVersion: string;
}

export type UpdateCheckOptions = {
	/** Whether stdout is a terminal: a box for a person, a single stderr line otherwise. */
	isTerminal?: boolean;
	env?: NodeJS.ProcessEnv;
	cacheFile?: string;
	currentVersion?: string;
	/** chef runs from its sources (npm link + tsx): it is updated from git, not from npm. */
	isSourceCheckout?: boolean;
	now?: number;
};

export type UpdateNotice = {
	style: 'box' | 'line';
	currentVersion: string;
	latestVersion: string;
};

export type UpdateCheckPlan = {
	notice: UpdateNotice | null;
	refreshCache: boolean;
};

function readCache(cacheFile: string): UpdateCache | null
{
	try
	{
		const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
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

function refreshCacheInBackground(cacheFile: string): void
{
	try
	{
		const child = spawn(process.execPath, ['-e', REFRESH_SCRIPT, cacheFile, PACKAGE_NAME], {
			detached: true,
			stdio: 'ignore',
			windowsHide: true,
		});

		child.on('error', () => {
			// ignore — update check is non-critical
		});
		child.unref();
	}
	catch
	{
		// ignore — update check is non-critical
	}
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

function isContinuousIntegration(env: NodeJS.ProcessEnv): boolean
{
	return Boolean(env.CI) && env.CI !== 'false' && env.CI !== '0';
}

/**
 * Decides what the update check does in this run. `null` means the check is off: disabled
 * with NO_UPDATE_NOTIFIER, running in CI, or chef runs from its sources.
 */
export function planUpdateCheck(options: UpdateCheckOptions = {}): UpdateCheckPlan | null
{
	const env = options.env ?? process.env;
	const isSourceCheckout = options.isSourceCheckout ?? import.meta.filename.endsWith('.ts');

	if (env.NO_UPDATE_NOTIFIER || isContinuousIntegration(env) || isSourceCheckout)
	{
		return null;
	}

	const currentVersion = options.currentVersion ?? getChefVersion();
	const cache = readCache(options.cacheFile ?? DEFAULT_CACHE_FILE);
	const now = options.now ?? Date.now();

	const notice: UpdateNotice | null = cache && isNewerVersion(currentVersion, cache.latestVersion)
		? {
			style: (options.isTerminal ?? process.stdout.isTTY === true) ? 'box' : 'line',
			currentVersion,
			latestVersion: cache.latestVersion,
		}
		: null;

	return {
		notice,
		refreshCache: !cache || now - cache.lastCheck > CHECK_INTERVAL,
	};
}

/**
 * The notice for runs without a terminal (coding agents, scripts). The format is stable:
 * tools look for it in stderr.
 */
export function formatUpdateLine(currentVersion: string, latestVersion: string): string
{
	return `chef: update available ${currentVersion} → ${latestVersion}, run: ${UPDATE_COMMAND}`;
}

/**
 * Checks for updates in background and shows a notification if a newer version is available.
 * Call at CLI startup — it is non-blocking.
 */
export function checkForUpdates(options: UpdateCheckOptions = {}): void
{
	const plan = planUpdateCheck(options);
	if (!plan)
	{
		return;
	}

	if (plan.notice)
	{
		showUpdateNotification(plan.notice);
	}

	if (plan.refreshCache)
	{
		refreshCacheInBackground(options.cacheFile ?? DEFAULT_CACHE_FILE);
	}
}

function showUpdateNotification(notice: UpdateNotice): void
{
	if (notice.style === 'line')
	{
		const line = `${formatUpdateLine(notice.currentVersion, notice.latestVersion)}\n`;

		// stdout stays clean: --reporter json and --reporter teamcity output is read from it.
		process.on('exit', () => {
			try
			{
				fs.writeSync(2, line);
			}
			catch
			{
				process.stderr.write(line);
			}
		});

		return;
	}

	const current = chalk.dim(notice.currentVersion);
	const latest = chalk.green.bold(notice.latestVersion);
	const command = chalk.cyan(UPDATE_COMMAND);

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
