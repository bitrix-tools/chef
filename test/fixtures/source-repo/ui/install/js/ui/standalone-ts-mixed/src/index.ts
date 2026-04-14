import { Core } from 'main.core';
import { TsLib } from 'main.ts-lib';

export class MixedTsApp
{
	#core: Core;
	#lib: TsLib;

	constructor()
	{
		this.#core = new Core();
		this.#lib = new TsLib({ name: 'mixed-ts', version: 2 });
	}

	isReady(): boolean
	{
		return this.#core.isReady();
	}

	getLibName(): string
	{
		return this.#lib.getName();
	}
}
