import { Command } from 'commander';

export type CommandRegistryEntry = {
	name: string,
	description: string,
	load: () => Promise<Record<string, unknown>>,
};

/**
 * Top-level chef commands. Modules are loaded on demand so that `chef <command>`
 * pays only for the command it runs.
 */
export const commandRegistry: CommandRegistryEntry[] = [
	{ name: 'build', description: 'Build JS extensions for Bitrix', load: () => import('./build/build-command') },
	{ name: 'lint', description: 'Run linting for Bitrix JS extensions', load: () => import('./lint/lint-command') },
	{ name: 'test', description: 'Run unit and end-to-end tests for extensions', load: () => import('./test/test-command') },
	{ name: 'create', description: 'Create a new Bitrix JS extension scaffold', load: () => import('./create/create-command') },
	{ name: 'flow-to-ts', description: 'Migrate Flow-typed JS code to TypeScript in extensions', load: () => import('./flow-to-ts/flow-to-ts-command') },
	{ name: 'aliases', description: 'Regenerate path aliases for TypeScript', load: () => import('./aliases/aliases-command') },
	{ name: 'init', description: 'Initialize testing and build tooling for your Bitrix project', load: () => import('./init/init-command') },
	{ name: 'typecheck', description: 'Check TypeScript types in extensions', load: () => import('./typecheck/typecheck-command') },
	{ name: 'diag', description: 'Diagnose and analyze extensions across the project', load: () => import('./diag/diag-command') },
	{ name: 'baseline', description: 'Check if a web feature is supported by current browser targets', load: () => import('./baseline/baseline-command') },
	{ name: 'help', description: 'Show help for a command, or "chef help agent" for the AI agent guide', load: () => import('./help/help-command') },
];

export async function loadCommand(entry: CommandRegistryEntry): Promise<Command>
{
	const module = await entry.load();

	return Object.values(module).find((value) => value instanceof Command) as Command;
}
