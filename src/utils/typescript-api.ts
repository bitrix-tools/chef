import type { API, Diagnostic } from 'typescript/unstable/sync';

let apiPromise: Promise<API> | null = null;

/**
 * TypeScript 7 runs the compiler as a separate native process that the API talks to over IPC.
 * The process is spawned on first use and shared by the whole chef run, so files it has
 * already parsed (lib.d.ts, dependencies of the previous extension) are reused.
 */
export function getTypeScriptApi(): Promise<API>
{
	apiPromise ??= import('typescript/unstable/sync').then(({ API }) => {
		return new API({ cwd: process.cwd() });
	});

	return apiPromise;
}

/**
 * Joins a diagnostic with its message chain into one text: every chained message goes
 * on its own line, indented by its depth in the chain.
 */
export function flattenDiagnosticText(diagnostic: Diagnostic, indentLevel = 0): string
{
	const prefix = indentLevel > 0 ? `\n${'  '.repeat(indentLevel)}` : '';
	const chained = (diagnostic.messageChain ?? []).map((child) => {
		return flattenDiagnosticText(child, indentLevel + 1);
	});

	return prefix + diagnostic.text + chained.join('');
}
