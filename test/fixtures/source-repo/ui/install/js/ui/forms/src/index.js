import { Button } from 'ui.buttons';

export class Form
{
	constructor()
	{
		this.submitButton = new Button('Submit');
	}

	render()
	{
		return `<form>${this.submitButton.render()}</form>`;
	}
}
