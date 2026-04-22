import fs from 'node:fs';

import { bundleDeclarations } from './declaration/declaration-bundler';
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
	async emit(options: DeclarationEmitOptions): Promise<void>
	{
		const { packageRoot, input, namespace, outputPath } = options;

		if (!namespace || namespace === 'window')
		{
			return;
		}

		const bundle = await bundleDeclarations({
			packageRoot,
			input,
			namespace,
			extensionName: options.extensionName,
			compilerOptions: options.compilerOptions,
		});

		if (!bundle)
		{
			return;
		}

		const mode = options.mode ?? 'ambient';
		const layout = qualifyTopLevelReferences(bundle, namespace);

		if (!hasAnyStatements(layout))
		{
			return;
		}

		const content = printBundle(layout, {
			mode,
			moduleName: options.moduleName,
		});

		if (!content)
		{
			return;
		}

		fs.writeFileSync(outputPath, content, 'utf-8');
	}
}
