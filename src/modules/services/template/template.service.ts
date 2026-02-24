import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileExistsAsync } from '../../../utils/file.exists.async';

export class TemplateService
{
	#templateFolder: string;

	constructor(templateFolder?: string)
	{
		this.#templateFolder = templateFolder;
	}

	async get(templateName: string): Promise<string | null>
	{
		const templatePath = path.join(this.#templateFolder, templateName);
		if (await fileExistsAsync(templatePath))
		{
			return fs.readFile(templatePath, 'utf-8');
		}

		return null;
	}

	async render(templateName: string, data: Record<string, string>): Promise<string | null>
	{
		const templateContent = await this.get(templateName);
		if (templateContent)
		{
			return Object.entries(data).reduce((acc, [key, value]) => {
				return acc.replaceAll(key, value);
			}, templateContent);
		}

		return null;
	}
}
