import { greet } from 'ui.npm-wrapper-types.greet';

export class ExposeRemapNpmGlobApp
{
	sayHi(name)
	{
		return greet(name);
	}
}
