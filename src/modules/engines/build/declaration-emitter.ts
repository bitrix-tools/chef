import fs from 'node:fs';

import { bundleDeclarations, type DeclarationDiagnostic } from './declaration/declaration-bundler';
import { qualifyTopLevelReferences } from './declaration/declaration-layout';
import { printBundle, hasAnyStatements, type DeclarationMode } from './declaration/declaration-printer';

export interface DeclarationEmitOptions
{
	packageRoot: string;
	input: string;
	namespace: string;
	outputPath: string;
	extensionName?: string;
	mode?: DeclarationMode;
	moduleName?: string;
	compilerOptions?: import('typescript').CompilerOptions;
}

export class DeclarationEmitter
{
	async emit(options: DeclarationEmitOptions): Promise<DeclarationDiagnostic[]>
	{
		const { packageRoot, input, namespace, outputPath } = options;

		if (!namespace || namespace === 'window')
		{
			return [];
		}

		const { bundle, diagnostics } = await bundleDeclarations({
			packageRoot,
			input,
			namespace,
			extensionName: options.extensionName,
			compilerOptions: options.compilerOptions,
		});

		const content = bundle ? this.#renderBundle(bundle, namespace, options) : null;

		if (content)
		{
			fs.writeFileSync(outputPath, content, 'utf-8');
		}
		else if (fs.existsSync(outputPath))
		{
			// No new content to write — drop the previous .d.ts so consumers do not work
			// against an out-of-date file (e.g. one that still references symbols already
			// removed from the source).
			fs.unlinkSync(outputPath);
		}

		return diagnostics;
	}

	#renderBundle(
		bundle: NonNullable<Awaited<ReturnType<typeof bundleDeclarations>>['bundle']>,
		namespace: string,
		options: DeclarationEmitOptions,
	): string | null
	{
		const mode = options.mode ?? 'ambient';
		const layout = qualifyTopLevelReferences(bundle, namespace);

		if (!hasAnyStatements(layout))
		{
			return null;
		}

		return printBundle(layout, {
			mode,
			moduleName: options.moduleName,
		}) || null;
	}
}
