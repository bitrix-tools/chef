import * as fs from 'node:fs';

import { Environment } from '../environment/environment';
import { CF } from '../diagnostics/diagnostic-codes';

import type { ChefErrorPayload } from './types';

/**
 * Sets the Environment context for the given working directory.
 * Returns null on success, or a ChefErrorPayload describing the failure.
 * Never throws — designed for use in API functions where errors are returned
 * via the result object.
 */
export function initializeEnvironment(cwd: string): ChefErrorPayload | null
{
	if (!fs.existsSync(cwd))
	{
		return {
			code: CF.INVALID_CWD,
			message: `Working directory does not exist: ${cwd}`,
		};
	}

	try
	{
		Environment.setContext(cwd);
	}
	catch (error)
	{
		return {
			code: CF.INVALID_CWD,
			message: error instanceof Error ? error.message : String(error),
		};
	}

	if (Environment.getType() === 'unknown')
	{
		return {
			code: CF.PROJECT_ROOT_NOT_FOUND,
			message: `Could not detect a Bitrix project root from ${cwd}`,
		};
	}

	return null;
}
