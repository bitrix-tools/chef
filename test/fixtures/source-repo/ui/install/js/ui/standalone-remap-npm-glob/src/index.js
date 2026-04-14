import { greet } from 'ui.npm-wrapper-types.greet';

export class NpmGlobApp
{
	sayHi(name)
	{
		return greet(name);
	}
}
