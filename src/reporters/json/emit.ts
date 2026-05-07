export function emitJson(payload: unknown): void
{
	process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
}
