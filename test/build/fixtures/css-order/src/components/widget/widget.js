import { Panel } from '../panel/panel';

import './css/widget.css';

export class Widget
{
	constructor()
	{
		this.panel = new Panel();
	}

	render()
	{
		return `<div class="widget">${this.panel.render()}</div>`;
	}
}
