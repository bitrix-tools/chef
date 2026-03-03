import * as path from 'node:path';
import { BasePackage } from '../base-package';
import { Environment } from '../../../environment/environment';

export class CustomPackage extends BasePackage
{
	getName(): string
	{
		return path.relative(Environment.getRoot(), this.getPath());
	}

	getModuleName(): string
	{
		return this.getPath().split('/').shift();
	}

	getPublicPath(): string
	{
		const relativePath = path.relative(Environment.getRoot(), this.getPath());
		const segments = relativePath.split(path.sep);

		const markers = ['js', 'components', 'templates', 'activities'] as const;

		const templatesIndex = segments.indexOf('templates');
		const componentsAfterTemplates = templatesIndex !== -1
			? segments.indexOf('components', templatesIndex)
			: -1;

		if (componentsAfterTemplates !== -1)
		{
			const pathFromTemplates = segments.slice(templatesIndex).join('/');
			return this.resolvePublicPath(pathFromTemplates);
		}

		for (const marker of markers)
		{
			const markerIndex = segments.indexOf(marker);
			if (markerIndex !== -1)
			{
				const pathFromMarker = segments.slice(markerIndex).join('/');
				return this.resolvePublicPath(pathFromMarker);
			}
		}

		return '';
	}
}
