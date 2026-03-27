import { Tag } from 'main.core';
import { Popup } from 'main.popup';

export class IncludesComponent
{
	constructor()
	{
		this.popup = new Popup();
	}

	render()
	{
		return Tag.render`<div>Includes Test</div>`;
	}
}