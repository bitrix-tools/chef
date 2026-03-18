import { Tag } from 'main.core';

export class TsComponent
{
	#message: string;

	constructor(message: string)
	{
		this.#message = message;
	}

	render(): HTMLElement
	{
		return Tag.render`<div>${this.#message}</div>`;
	}
}
