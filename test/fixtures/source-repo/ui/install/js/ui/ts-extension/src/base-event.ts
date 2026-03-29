export type EventCallback = (data: unknown) => void;

export default class BaseEvent
{
	#type: string;

	constructor(type: string)
	{
		this.#type = type;
	}

	getType(): string
	{
		return this.#type;
	}
}
