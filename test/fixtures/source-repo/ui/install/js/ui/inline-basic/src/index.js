import { usedHelper } from 'ui.inline-lib';
import { TsLib } from 'main.ts-lib';

export class InlineApp
{
	run()
	{
		return usedHelper();
	}

	getLibName()
	{
		return new TsLib({ name: 'lib', version: 1 }).getName();
	}
}
