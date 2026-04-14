import { Core } from 'main.core';
import './style.css';

export class StyledApp
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
