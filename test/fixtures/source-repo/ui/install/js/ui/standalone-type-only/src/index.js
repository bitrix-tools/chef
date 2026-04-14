import { Form } from 'ui.type-only-dep';

export class Widget
{
	constructor()
	{
		this.form = new Form();
	}

	render()
	{
		return this.form.render();
	}
}
