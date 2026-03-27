import './styles.css';

export class Panel
{
	#element;

	constructor(container)
	{
		this.#element = document.createElement('div');
		this.#element.className = 'js-panel';
		container.appendChild(this.#element);
	}

	setContent(html)
	{
		this.#element.innerHTML = html;
	}
}
