import { formatName } from './utils.js';

export class Greeter
{
	#prefix;

	constructor(prefix)
	{
		this.#prefix = prefix;
	}

	greet(name)
	{
		return `${this.#prefix} ${formatName(name)}`;
	}
}
