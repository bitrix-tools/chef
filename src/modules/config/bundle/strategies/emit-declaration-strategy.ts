import { ConfigStrategy } from '../../config-strategy';

export type EmitDeclarationMode = 'ambient' | 'module' | 'both';

export interface EmitDeclarationConfig {
	enabled: boolean;
	mode: EmitDeclarationMode;
}

const VALID_MODES: readonly EmitDeclarationMode[] = ['ambient', 'module', 'both'];

function isValidMode(value: unknown): value is EmitDeclarationMode
{
	return typeof value === 'string' && (VALID_MODES as readonly string[]).includes(value);
}

export const emitDeclarationStrategy = {
	key: 'emitDeclaration',
	getDefault(): EmitDeclarationConfig
	{
		return { enabled: true, mode: 'ambient' };
	},
	prepare(value: any): EmitDeclarationConfig
	{
		if (value === true)
		{
			return { enabled: true, mode: 'ambient' };
		}

		if (value === false)
		{
			return { enabled: false, mode: 'ambient' };
		}

		if (isValidMode(value))
		{
			return { enabled: true, mode: value };
		}

		if (typeof value === 'object' && value !== null)
		{
			const enabled = value.enabled !== false;
			const mode: EmitDeclarationMode = isValidMode(value.mode) ? value.mode : 'ambient';

			return { enabled, mode };
		}

		return { enabled: true, mode: 'ambient' };
	},
	validate(value: any): true | string
	{
		if (typeof value === 'boolean') return true;
		if (isValidMode(value)) return true;

		if (typeof value === 'object' && value !== null)
		{
			if (value.enabled !== undefined && typeof value.enabled !== 'boolean')
			{
				return 'Invalid \'emitDeclaration.enabled\' value: expected a boolean';
			}

			if (value.mode !== undefined && !isValidMode(value.mode))
			{
				return `Invalid 'emitDeclaration.mode' value: expected one of ${VALID_MODES.join(', ')}`;
			}

			return true;
		}

		return 'Invalid \'emitDeclaration\' value';
	},
} satisfies ConfigStrategy<EmitDeclarationConfig>
