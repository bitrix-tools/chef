import { Core } from 'main.core';
import './style.css';

export class CssOnlyDepApp
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
