import { TsLib } from 'main.ts-lib';

export class App
{
	constructor()
	{
		this.lib = new TsLib({ name: 'test', version: 1 });
	}

	getLibName()
	{
		return this.lib.getName();
	}
}
