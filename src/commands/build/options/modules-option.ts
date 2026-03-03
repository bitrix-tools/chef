import { Option } from 'commander';
import { parseArgValue } from '../../../utils/cli/parse-arg-value';

const modulesOption = new Option(
	'-m, --modules [modules...]',
	'Build extensions that belong to the specified Bitrix modules',
);

modulesOption.conflicts([
	'extensions',
	'path',
]);

modulesOption.argParser(
	parseArgValue,
);

export {
	modulesOption,
};
