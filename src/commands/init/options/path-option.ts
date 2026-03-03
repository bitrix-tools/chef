import { Option } from 'commander';
import { preparePath } from '../../../utils/cli/prepare-path';

const pathOption = new Option(
	'-p, --path [path]',
	'Project root where configs and helpers will be initialized',
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
