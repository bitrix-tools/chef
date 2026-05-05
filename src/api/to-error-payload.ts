import { ChefError } from '../diagnostics/chef-error';
import { CF } from '../diagnostics/diagnostic-codes';

import type { ChefErrorPayload } from './types';

export function toErrorPayload(error: unknown, fallbackCode: string = CF.UNCAUGHT_EXCEPTION): ChefErrorPayload
{
	if (error instanceof ChefError)
	{
		return { code: error.code, message: error.message };
	}

	if (error instanceof Error)
	{
		return { code: fallbackCode, message: error.message };
	}

	return { code: fallbackCode, message: String(error) };
}
