import chalk from 'chalk';

import { findPackages } from '../../utils/package/find-packages';
import { PackageFactoryProvider } from '../../modules/packages/providers/package-factory-provider';
import { createSnapshot } from './package-snapshot';
import { createSpinner } from './progress-spinner';

import type { BasePackage } from '../../modules/packages/base-package';
import type { PackageSnapshot, SnapshotField } from './package-snapshot';

type CollectResult = {
	snapshots: PackageSnapshot[];
	duration: number;
	scanned: number;
};

type CollectOptions = {
	startDirectory: string;
	fields: Set<SnapshotField>;
	title: string;
	howItWorks?: string[];
	filter?: (extension: BasePackage) => boolean;
};

export async function collectPackages(
	{ startDirectory, fields, title, howItWorks, filter }: CollectOptions,
): Promise<CollectResult>
{
	console.log('');
	console.log(` ${chalk.bold(title)}`);

	if (howItWorks)
	{
		for (const line of howItWorks)
		{
			console.log(` ${chalk.dim(line)}`);
		}
	}

	console.log('');

	const start = performance.now();
	const packageFactory = PackageFactoryProvider.create();
	const stream = findPackages({ startDirectory, packageFactory });

	const snapshots: PackageSnapshot[] = [];
	let scanned = 0;

	const spinner = createSpinner('Scanning extensions... 0');

	return new Promise<CollectResult>((resolve, reject) => {
		const queue: Promise<void>[] = [];

		stream
			.on('data', ({ extension }: { extension: BasePackage }) => {
				scanned++;
				spinner.update(`Scanning extensions... ${scanned}`);

				if (filter && !filter(extension))
				{
					return;
				}

				const task = createSnapshot(extension, fields)
					.then((snapshot) => {
						snapshots.push(snapshot);
					})
					.catch(() => {
						// Skip extensions that fail to snapshot
					});

				queue.push(task);
			})
			.on('done', async () => {
				await Promise.all(queue);
				spinner.stop();

				resolve({
					snapshots,
					duration: performance.now() - start,
					scanned,
				});
			})
			.on('error', (error: Error) => {
				spinner.stop();
				reject(error);
			});
	});
}
