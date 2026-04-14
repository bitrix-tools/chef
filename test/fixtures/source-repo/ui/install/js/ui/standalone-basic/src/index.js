import { Core } from 'main.core';

export class StandaloneApp
{
	constructor()
	{
		this.core = new Core();
	}

	isReady()
	{
		return this.core.isReady();
	}
}
