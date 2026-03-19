import { Option } from 'commander';

import { ExtensionPackage } from '../../../modules/packages/package/extension-package';
import { ComponentPackage } from '../../../modules/packages/package/component-package';
import { TemplatePackage } from '../../../modules/packages/package/template-package';
import { CustomPackage } from '../../../modules/packages/package/custom-package';

import type { BasePackage } from '../../../modules/packages/base-package';

const PACKAGE_TYPES = ['extension', 'component', 'template', 'custom'] as const;

type PackageType = typeof PACKAGE_TYPES[number];

const typeToClass: Record<PackageType, new (...args: any[]) => BasePackage> = {
	extension: ExtensionPackage,
	component: ComponentPackage,
	template: TemplatePackage,
	custom: CustomPackage,
};

export function createTypeOption(): Option
{
	return new Option(
		'-t, --type <type>',
		'Filter by package type',
	).choices([...PACKAGE_TYPES]);
}

export function createTypeFilter(type: string): (extension: BasePackage) => boolean
{
	const PackageClass = typeToClass[type as PackageType];

	return (extension: BasePackage) => extension instanceof PackageClass;
}
