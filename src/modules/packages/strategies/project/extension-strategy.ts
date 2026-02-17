import { PackageFactoryStrategy } from '../../package-factory';
import { ExtensionPackage } from '../../package/extension-package';
import { PathDetector } from '../../../../utils/path/path-detector';

export const extensionStrategy: PackageFactoryStrategy = {
	match: ({ path }) => {
		return (
			PathDetector.isLocalJs(path)
			|| PathDetector.isLocalInstallJs(path)
			|| PathDetector.isBitrixJs(path)
		);
	},
	create: ({ path }) => new ExtensionPackage({ path }),
};
