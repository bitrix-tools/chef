import { CssImagesDepApp } from 'ui.css-images-dep';
import './style.css';

export class StandaloneCssImagesApp
{
	constructor()
	{
		this.dep = new CssImagesDepApp();
	}

	render()
	{
		return this.dep.render();
	}
}
