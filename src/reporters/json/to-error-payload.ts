import { ChefError } from '../../diagnostics/chef-error';
import { CF } from '../../diagnostics/diagnostic-codes';

import type { JsonErrorPayload } from './types';

export function toErrorPayload(error: unknown, fallbackCode: string = CF.UNCAUGHT_EXCEPTION): JsonErrorPayload
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
