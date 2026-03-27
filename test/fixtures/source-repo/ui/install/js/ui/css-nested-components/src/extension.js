import './extension.css';
import { Header } from './components/header/header';
import { Sidebar } from './components/sidebar/sidebar';
import { Content } from './components/content/content';

export class App
{
	constructor()
	{
		this.header = new Header();
		this.sidebar = new Sidebar();
		this.content = new Content();
	}

	render()
	{
		return `<div class="app">${this.header.render()}${this.sidebar.render()}${this.content.render()}</div>`;
	}
}
