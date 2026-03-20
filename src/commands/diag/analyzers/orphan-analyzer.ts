import { scanJsAndPhpFiles, stripComments } from './file-scanner';

import type { PackageSnapshot } from '../package-snapshot';

export type OrphanResult = {
	name: string;
};

export async function analyzeOrphans(
	packages: PackageSnapshot[],
	startDirectory: string,
): Promise<OrphanResult[]>
{
	const allNames = new Set(packages.map((p) => p.name));

	// Collect all extension names referenced as dependencies in config.php
	const referencedInConfig = new Set<string>();

	for (const pkg of packages)
	{
		for (const dep of pkg.dependencies)
		{
			referencedInConfig.add(dep);
		}
	}

	// Collect all extension names mentioned in JS/TS/PHP files
	const referencedInCode = await findReferencedExtensions(allNames, startDirectory);

	// Extensions that are never referenced anywhere
	const orphans: OrphanResult[] = [];

	for (const pkg of packages)
	{
		if (referencedInConfig.has(pkg.name))
		{
			continue;
		}

		if (referencedInCode.has(pkg.name))
		{
			continue;
		}

		orphans.push({ name: pkg.name });
	}

	return orphans.sort((a, b) => a.name.localeCompare(b.name));
}

async function findReferencedExtensions(
	allNames: Set<string>,
	startDirectory: string,
): Promise<Set<string>>
{
	const referenced = new Set<string>();

	await scanJsAndPhpFiles(
		startDirectory,
		(_file, content) => {
			checkNames(stripComments(content), allNames, referenced);
		},
		(_file, content) => {
			checkNames(stripComments(content), allNames, referenced);
		},
	);

	return referenced;
}

/**
 * Checks content for extension name references in quotes.
 * Matches: import 'ext', from 'ext', BX.loadExtension('ext'),
 * Extension::load('ext'), CJSCore::Init(['ext']), config.php rel, etc.
 */
function checkNames(content: string, allNames: Set<string>, referenced: Set<string>): void
{
	for (const name of allNames)
	{
		if (referenced.has(name))
		{
			continue;
		}

		if (content.includes(`'${name}'`) || content.includes(`"${name}"`))
		{
			referenced.add(name);
		}
	}
}
