import { verboseBuild } from './verbose-build';
import { plainBuild } from './plain-build';

import type { BasePackage } from '../../../modules/packages/base-package';
import type { TaskGroupResult } from '../../../modules/task/task-types';

export function build(extension: BasePackage, args: Record<string, any>): () => Promise<TaskGroupResult>
{
	return async () => {
		if (args.verbose)
		{
			return verboseBuild(extension, args);
		}

		return plainBuild(extension, args);
	};
}
