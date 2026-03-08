import * as fs from 'node:fs';

export function getFileSize(filePath: string): number | null
{
	try
	{
		if (fs.existsSync(filePath))
		{
			return fs.statSync(filePath).size;
		}
	}
	catch
	{
		// Ignore errors
	}

	return null;
}
