import { Card } from './card/card';
import { List } from './list/list';

import './content.css';

export class Content
{
	constructor()
	{
		this.card = new Card();
		this.list = new List();
	}

	render()
	{
		return `<div class="content">${this.card.render()}${this.list.render()}</div>`;
	}
}
