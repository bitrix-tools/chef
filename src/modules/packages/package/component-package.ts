import * as path from 'node:path';
import { BasePackage } from '../base-package';
import { createPackageName } from '../../../utils/package/create-package-name';
import { Environment } from '../../../environment/environment';

export class ComponentPackage extends BasePackage
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
		const relativePath = path.relative(Environment.getRoot(), this.getPath());
		const segments = relativePath.split(path.sep);

		const componentsIndex = segments.indexOf('components');
		if (componentsIndex === -1)
		{
			return '';
		}

		const componentRelativePath = segments.slice(componentsIndex + 1).join('/');
		return this.resolvePublicPath(`components/${componentRelativePath}`);
	}
}
