import { Core } from 'main.core';
import { TsLib } from 'main.ts-lib';

export class MixedApp
{
	constructor()
	{
		this.core = new Core();
		this.lib = new TsLib({ name: 'mixed', version: 1 });
	}

	isReady()
	{
		return this.core.isReady();
	}

	getLibName()
	{
		return this.lib.getName();
	}
}
