import { JsWithCssRelLib } from 'ui.js-with-css-rel';
import './style.css';

export class ExposeCssApp
{
	constructor()
	{
		this.lib = new JsWithCssRelLib();
	}

	getValue()
	{
		return this.lib.getValue();
	}
}
