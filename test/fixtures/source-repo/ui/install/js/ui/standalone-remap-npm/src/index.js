import { greet } from 'ui.npm-wrapper-types';

export class Greeter
{
	sayHello(name)
	{
		return greet(name);
	}
}
