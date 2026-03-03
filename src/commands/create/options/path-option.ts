import { Option } from 'commander';
import { preparePath } from '../../../utils/cli/prepare-path';

const pathOption = new Option(
	'-p, --path [path]',
	'Root directory where the extension will be created',
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
