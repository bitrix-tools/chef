import { Tag } from 'main.core';
import { Client } from 'rest.client';

export class MyComponent
{
	render()
	{
		return Tag.render`<div>hello</div>`;
	}

	getClient()
	{
		return new Client();
	}
}
