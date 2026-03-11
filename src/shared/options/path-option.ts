import { Option } from 'commander';

import { preparePath } from '../../utils/cli/prepare-path';

export function createPathOption(description: string): Option
{
	const option = new Option(
		'-p, --path [path]',
		description,
	);

	option.argParser(
		preparePath,
	);

	option.default(
		process.cwd(),
	);

	return option;
}
