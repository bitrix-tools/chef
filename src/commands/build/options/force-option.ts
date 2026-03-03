import { Option } from 'commander';

export const forceOption = new Option(
	'-f, --force',
	'Skip safety checks and force rebuild',
);
