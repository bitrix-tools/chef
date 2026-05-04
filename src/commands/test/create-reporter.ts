import { TestReporter } from '../../modules/engines/test/test-reporter';
import { TeamcityReporter } from '../../modules/engines/test/teamcity-reporter';

export type Reporter = TestReporter | TeamcityReporter;

export type CreateReporterOptions = {
	showSummary?: boolean;
};

export function createReporter(
	type?: string,
	onStatus?: (message: string) => void,
	options: CreateReporterOptions = {},
): Reporter
{
	if (type === 'teamcity')
	{
		return new TeamcityReporter();
	}

	return new TestReporter(onStatus, options);
}
