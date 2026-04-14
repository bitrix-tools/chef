import { FlowComponent } from 'ui.flow-extension';

export class Wrapper
{
	#component: FlowComponent;

	constructor()
	{
		this.#component = new FlowComponent({ name: 'test', value: 42 });
	}

	getName(): string
	{
		return this.#component.getName();
	}
}
