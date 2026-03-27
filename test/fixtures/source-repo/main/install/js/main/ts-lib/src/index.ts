interface LibConfig {
	name: string;
	version: number;
}

export class TsLib
{
	#config: LibConfig;

	constructor(config: LibConfig)
	{
		this.#config = config;
	}

	getName(): string
	{
		return this.#config.name;
	}

	getVersion(): number
	{
		return this.#config.version;
	}
}
