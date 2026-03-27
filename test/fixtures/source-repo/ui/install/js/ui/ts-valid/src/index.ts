export class Widget
{
	#name: string;

	constructor(name: string)
	{
		this.#name = name;
	}

	getName(): string
	{
		return this.#name;
	}
}
