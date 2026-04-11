import './style.css';

export class Core
{
	constructor()
	{
		this.ready = true;
	}

	isReady()
	{
		return this.ready;
	}
}

export const Tag = {
	render(strings, ...values)
	{
		return document.createElement('div');
	},
};
