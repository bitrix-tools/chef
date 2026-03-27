export class Logger
{
	#messages = [];

	log(message)
	{
		this.#messages.push(message);
	}

	getMessages()
	{
		return [...this.#messages];
	}
}
