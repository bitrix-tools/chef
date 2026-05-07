import { getChefVersion } from '../../utils/chef-version';

import type { JsonMeta } from './types';

export function buildMeta(cwd: string): JsonMeta
{
	return {
		chefVersion: getChefVersion(),
		cwd,
	};
}
