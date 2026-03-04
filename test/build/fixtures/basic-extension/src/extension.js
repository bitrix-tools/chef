import { Tag } from 'main.core';
import './extension.css';

export class BasicComponent
{
	constructor(message)
	{
		this.message = message;
	}

	render()
	{
		return Tag.render`<div class="basic-component">${this.message}</div>`;
	}
}