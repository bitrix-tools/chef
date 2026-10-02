import { Button } from 'ui.buttons';
import { Form } from 'ui.forms';

export function render()
{
	return new Button('Save').render() + new Form().render();
}
