import { Widget } from './components/widget/widget';

import './css/app.css';

export class App
{
	constructor()
	{
		this.widget = new Widget();
	}

	render()
	{
		return `<div class="app">${this.widget.render()}</div>`;
	}
}
