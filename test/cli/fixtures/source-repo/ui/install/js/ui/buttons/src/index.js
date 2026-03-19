import { Core } from 'main.core';

export class Button
{
	constructor(text)
	{
		this.text = text;
		this.core = new Core();
	}

	render()
	{
		return `<button>${this.text}</button>`;
	}
}
