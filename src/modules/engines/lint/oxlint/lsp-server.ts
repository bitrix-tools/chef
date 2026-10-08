import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { oxlintBin } from './run-oxlint';

/**
 * Node arguments that run `oxlint --lsp`.
 *
 * The server starts as oxlint's own `bin/oxlint` starts it (see its dist/cli.js), except that
 * every AST buffer gets an id of its own on the JS side. oxlint numbers the buffers of each
 * workspace from 0, while its JS plugins keep one array of buffers for all workspaces: with
 * several workspaces a file was linted on the AST another workspace had left in the same
 * slot, so JS plugin rules failed ("Error running JS plugin") or reported another file.
 */
export function oxlintServerArgs(): string[]
{
	const distUrl = pathToFileURL(path.join(path.dirname(oxlintBin()), '..', 'dist') + path.sep).href;

	return ['--input-type=module', '--eval', SERVER_PROGRAM.replace('DIST_URL', JSON.stringify(distUrl))];
}

const SERVER_PROGRAM = `
const dist = new URL(DIST_URL);
const bindings = await import(new URL('bindings.js', dist));
const lint = Object.values(bindings).find((value) => value?.name === 'lint');

let plugins = null;
let workspaces = null;
let configLoader = null;
// workspace and oxlint's buffer id -> buffer id on the JS side
const bufferIds = new Map();
let nextBufferId = 0;

async function loadPlugin(url, pluginName, pluginNameIsAlias, workspaceUri)
{
	plugins ??= await import(new URL('plugins.js', dist));

	return plugins.loadPlugin(url, pluginName, pluginNameIsAlias, workspaceUri);
}

function setupRuleConfigs(optionsJson)
{
	return plugins.setupRuleConfigs(optionsJson);
}

function lintFile(filePath, bufferId, buffer, ruleIds, optionsIds, settingsJson, globalsJson, collectTimings, workspaceUri)
{
	const key = workspaceUri + '\\n' + bufferId;
	// a buffer is sent once, then referred to by its id
	if (buffer !== null || !bufferIds.has(key))
	{
		bufferIds.set(key, nextBufferId++);
	}

	return plugins.lintFile(filePath, bufferIds.get(key), buffer, ruleIds, optionsIds, settingsJson, globalsJson, collectTimings, workspaceUri);
}

async function createWorkspace(workspaceUri)
{
	workspaces ??= await import(new URL('workspace.js', dist));

	return workspaces.createWorkspace(workspaceUri);
}

function destroyWorkspace(workspaceUri)
{
	workspaces.destroyWorkspace(workspaceUri);
}

async function loadJsConfigs(paths)
{
	if (!configLoader)
	{
		const { loadJsConfigs, loadVitePlusConfigs } = await import(new URL('js_config.js', dist));
		configLoader = process.env.VP_VERSION ? loadVitePlusConfigs : loadJsConfigs;
	}

	return configLoader(paths);
}

if (!process.stdout.isTTY)
{
	process.stdin._handle?.setBlocking?.(true);
	process.stdout._handle?.setBlocking?.(true);
}
// the LSP messages go to stdout from the native side: output of JS plugins goes to stderr
process.stdout.write = process.stderr.write.bind(process.stderr);

const succeeded = await lint(['--lsp'], loadPlugin, setupRuleConfigs, lintFile, createWorkspace, destroyWorkspace, loadJsConfigs);
if (!succeeded)
{
	process.exitCode = 1;
}
`;
