import { Option } from 'commander';
import { parseArgValue } from '../../../utils/cli/parse-arg-value';

const modulesOptions = new Option(
	'-m, --modules [modules...]',
	'Show stats for extensions that belong to the specified Bitrix modules',
);

modulesOptions.conflicts([
	'extensions',
	'path',
]);

modulesOptions.argParser(
	parseArgValue,
);

export {
	modulesOptions,
};
