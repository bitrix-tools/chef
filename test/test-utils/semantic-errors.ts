import { flattenDiagnosticText, getTypeScriptApi } from '../../src/utils/typescript-api';

/**
 * Semantic errors of a strict program built from `rootFiles`. Used to check that a generated
 * .d.ts type-checks for its consumers.
 */
export async function getSemanticErrors(rootFiles: string[]): Promise<string[]>
{
	const api = await getTypeScriptApi();
	const { ModuleKind } = await import('typescript/unstable/sync');
	const { ScriptTarget } = await import('typescript/unstable/ast');

	const program = api.createProgram(rootFiles, {
		strict: true,
		noEmit: true,
		skipLibCheck: true,
		target: ScriptTarget.ESNext,
		module: ModuleKind.ESNext,
	});

	try
	{
		return program.getSemanticDiagnostics().map((diagnostic) => flattenDiagnosticText(diagnostic));
	}
	finally
	{
		program.dispose();
	}
}
