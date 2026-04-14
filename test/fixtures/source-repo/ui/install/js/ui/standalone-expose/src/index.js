import { Helper, createHelper } from 'ui.ns-lib';

export class ExposeApp
{
	constructor()
	{
		this.helper = new Helper();
		this.helper2 = createHelper();
	}

	greet()
	{
		return this.helper.greet();
	}
}
