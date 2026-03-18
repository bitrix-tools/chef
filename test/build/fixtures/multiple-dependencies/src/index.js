import { Tag, Loc } from 'main.core';
import { Popup } from 'main.popup';
import { DesignTokens } from 'ui.design-tokens';

import './styles.css';

export class MultiDepComponent
{
	render()
	{
		const tokens = new DesignTokens();
		const popup = new Popup();

		return Tag.render`<div>${Loc.getMessage('HELLO')}</div>`;
	}
}
