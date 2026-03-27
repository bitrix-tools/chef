// @flow

type Options = {
	name: string,
	value: number,
};

export class FlowComponent
{
	#options: Options;

	constructor(options: Options)
	{
		this.#options = options;
	}

	getName(): string
	{
		return this.#options.name;
	}

	getValue(): number
	{
		return this.#options.value;
	}
}
