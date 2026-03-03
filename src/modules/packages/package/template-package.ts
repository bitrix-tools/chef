import * as path from 'node:path';
import { BasePackage } from '../base-package';
import { Environment } from '../../../environment/environment';

export class TemplatePackage extends BasePackage
{
	getName(): string
	{
		return this.getPath();
	}

	getModuleName(): string
	{
		return this.getPath().split('/').shift();
	}

	getPublicPath(): string
	{
		const relativePath = path.relative(Environment.getRoot(), this.getPath());
		const segments = relativePath.split(path.sep);

		const templatesIndex = segments.indexOf('templates');
		if (templatesIndex === -1)
		{
			return '';
		}

		const templateRelativePath = segments.slice(templatesIndex + 1).join('/');
		return this.resolvePublicPath(`templates/${templateRelativePath}`);
	}
}
