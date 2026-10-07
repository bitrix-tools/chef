import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export type OxlintDiagnostic = {
	message: string;
	code?: string;
	severity: 'error' | 'warning' | 'advice';
	// absolute path of the linted file
	filePath: string;
	// UTF-8 byte range in the linted file
	offset: number;
	length: number;
};

type RawDiagnostic = {
	message: string;
	code?: string;
	severity: OxlintDiagnostic['severity'];
	filename: string;
	labels?: Array<{ span: { offset: number; length: number } }>;
};

// A long file list is split: the oxlint launcher overflows its stack on ~10k arguments.
const FILES_PER_RUN = 500;

function oxlintBin(): string
{
	const require = createRequire(import.meta.url);

	return path.join(path.dirname(require.resolve('oxlint/package.json')), 'bin', 'oxlint');
}

function runOnce(options: { cwd: string; configPath: string; files: string[]; fix: boolean }): Promise<OxlintDiagnostic[]>
{
	const args = [
		oxlintBin(),
		'--config', options.configPath,
		'--format', 'json',
		...(options.fix ? ['--fix'] : []),
		...options.files,
	];

	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, args, { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
		child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
		child.on('error', reject);
		child.on('close', () => {
			const output = Buffer.concat(stdout).toString('utf8');
			let parsed: { diagnostics: RawDiagnostic[] };
			try
			{
				parsed = JSON.parse(output);
			}
			catch
			{
				const details = [output, Buffer.concat(stderr).toString('utf8')].join('\n').trim();
				reject(new Error(`oxlint failed: ${details}`));

				return;
			}

			resolve(parsed.diagnostics.map((diagnostic) => {
				const span = diagnostic.labels?.[0]?.span;
				const filename = diagnostic.filename.startsWith('file:')
					? fileURLToPath(diagnostic.filename)
					: path.resolve(options.cwd, diagnostic.filename);

				return {
					message: diagnostic.message,
					code: diagnostic.code,
					severity: diagnostic.severity,
					filePath: filename,
					offset: span?.offset ?? 0,
					length: span?.length ?? 0,
				};
			}));
		});
	});
}

export async function runOxlint(options: { cwd: string; configPath: string; files: string[]; fix: boolean }): Promise<OxlintDiagnostic[]>
{
	const diagnostics: OxlintDiagnostic[] = [];
	for (let i = 0; i < options.files.length; i += FILES_PER_RUN)
	{
		diagnostics.push(...await runOnce({ ...options, files: options.files.slice(i, i + FILES_PER_RUN) }));
	}

	return diagnostics;
}

/**
 * `eslint(no-undef)` -> `no-undef`, `unicorn(prefer-includes)` -> `unicorn/prefer-includes`,
 * `@stylistic(indent)` -> `@stylistic/indent`.
 */
export function toRuleId(code: string | undefined): string | null
{
	if (!code)
	{
		return null;
	}

	const match = /^(.+)\((.+)\)$/.exec(code);
	if (!match)
	{
		return code;
	}

	const [, plugin, rule] = match;

	return plugin === 'eslint' ? rule : `${plugin}/${rule}`;
}
