import { Option } from 'commander';

export function createLimitOption(): Option
{
	return new Option(
		'-l, --limit <number>',
		'Number of results to show',
	).default(10).argParser(Number);
}
