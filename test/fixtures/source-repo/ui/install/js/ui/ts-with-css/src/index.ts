import './styles.css';

export class Widget
{
	readonly #element: HTMLElement;

	constructor(container: HTMLElement)
	{
		this.#element = document.createElement('div');
		this.#element.className = 'ts-widget';
		container.appendChild(this.#element);
	}

	setText(text: string): void
	{
		this.#element.textContent = text;
	}
}
