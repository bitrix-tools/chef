import * as path from 'node:path';
import * as fs from 'node:fs';
import { BasePackage } from '../base-package';
import { createPackageName } from '../../../utils/package/create-package-name';
import { Environment } from '../../../environment/environment';

export class ExtensionPackage extends BasePackage
{
	getName(): string
	{
		return createPackageName(this.getPath());
	}

	getModuleName(): string
	{
		return this.getPath().split('/').shift();
	}

	getPublicPath(): string
	{
		const segments = this.getName().split('.');
		const environmentType = Environment.getType();
		if (environmentType === 'source')
		{
			return `/bitrix/js/${segments.join('/')}/`;
		}

		if (environmentType === 'project')
		{
			const localPath = `/local/js/${segments.join('/')}/`;
			const fullLocalPath = path.join(Environment.getRoot(), localPath);
			if (fs.existsSync(fullLocalPath))
			{
				return localPath;
			}

			const bitrixPath = `/bitrix/js/${segments.join('/')}/`;
			const fullBitrixPath = path.join(Environment.getRoot(), bitrixPath);
			if (fs.existsSync(fullBitrixPath))
			{
				return bitrixPath;
			}

			return '';
		}
	}
}
