import { program } from 'commander';

import { buildCommand } from './commands/build/build-command';
import { testCommand } from './commands/test/test-command';
import { createCommand } from './commands/create/create-command';
import { statCommand } from './commands/stat/stat-command';
import { checkCwdPreAction } from './hooks/check-cwd-pre-action';
import { adjustCwdPreAction } from './hooks/adjust-cwd-pre-action';
import { flowToTsCommand } from './commands/flow-to-ts/flow-to-ts.command';
import { initCommand } from './commands/init/init-command';

program
	.name('chef')
	.description('CLI toolkit for building, testing and maintaining Bitrix JS extensions')
	.addCommand(buildCommand)
	.addCommand(statCommand)
	.addCommand(testCommand)
	.addCommand(createCommand)
	.addCommand(flowToTsCommand)
	.addCommand(initCommand)
	.hook('preAction', adjustCwdPreAction)
	.hook('preAction', checkCwdPreAction)
	.parse(process.argv);
