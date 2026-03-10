import { TestReporter } from '../../modules/engines/test/test-reporter';
import { TeamcityReporter } from '../../modules/engines/test/teamcity-reporter';

export type Reporter = TestReporter | TeamcityReporter;

export function createReporter(type?: string): Reporter
{
	if (type === 'teamcity')
	{
		return new TeamcityReporter();
	}

	return new TestReporter();
}
