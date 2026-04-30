import { greet } from 'ui.npm-wrapper-types';

export class ExposeRemapNpmApp
{
	sayHello(name)
	{
		return greet(name);
	}
}
