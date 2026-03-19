export class TsWidget
{
	readonly label: string;

	constructor(label: string)
	{
		this.label = label;
	}

	render(): string
	{
		return `<div>${this.label}</div>`;
	}
}
