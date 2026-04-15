import { Core } from 'main.core';
import './style.css';

export class RecursiveCssApp
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
