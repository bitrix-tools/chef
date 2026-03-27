export class SequentialQueue
{
	#queue: Promise<void> = Promise.resolve();
	#pending = 0;
	#idleResolvers: Array<() => void> = [];

	add(fn: () => Promise<any>): Promise<void>
	{
		this.#pending++;
		this.#queue = this.#queue
			.then(fn)
			.catch(() => {})
			.finally(() => {
				this.#pending--;
				if (this.#pending === 0)
				{
					for (const resolve of this.#idleResolvers)
					{
						resolve();
					}
					this.#idleResolvers = [];
				}
			});

		return this.#queue;
	}

	onIdle(): Promise<void>
	{
		if (this.#pending === 0)
		{
			return Promise.resolve();
		}

		return new Promise((resolve) => {
			this.#idleResolvers.push(resolve);
		});
	}
}
