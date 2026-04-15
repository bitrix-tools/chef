import { Core } from 'main.core';
import 'ui.css-only';
import 'ui.css-no-bundleconfig';
import 'ui.css-absolute-path';
import './style.css';

export class CssImportApp
{
	constructor()
	{
		this.core = new Core();
	}

	isReady()
	{
		return this.core.isReady();
	}
}
