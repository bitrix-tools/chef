import { Form } from 'ui.type-only-dep';
import { greet } from 'ui.npm-wrapper-types.greet';

export class MixedRemapApp
{
	constructor()
	{
		this.form = new Form();
	}

	sayHi(name)
	{
		return greet(name);
	}
}
