import * as path from 'node:path';

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
		return path.relative(Environment.getRoot(), this.getPath()).split(path.sep).shift() ?? '';
	}

	shouldUpdatePhpConfig(): boolean
	{
		return this.getBundleConfig().get('adjustConfigPhp') !== false;
	}

	getPublicPath(): string
	{
		const segments = this.getName().split('.');
		return this.resolvePublicPath(`js/${segments.join('/')}`);
	}
}
