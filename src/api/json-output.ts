export function isJsonMode(): boolean
{
	return process.env.CHEF_JSON === '1';
}

export function emitJson(payload: unknown): void
{
	process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
}
