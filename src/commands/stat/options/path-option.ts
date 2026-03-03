import { Option } from 'commander';
import { preparePath } from '../../../utils/cli/prepare-path';

const pathOption = new Option(
	'-p, --path [path]',
	'Scan for extensions and stats starting from this directory',
);

pathOption.conflicts([
	'extensions',
	'modules',
]);

pathOption.argParser(
	preparePath,
);

pathOption.default(
	process.cwd(),
);

export {
	pathOption,
};
