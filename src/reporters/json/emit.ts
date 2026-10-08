/**
 * Writes the payload to stdout. Callers exit right after it, so they await the write: stdout
 * is asynchronous when it is a pipe on macOS, and `process.exit()` would cut the output short.
 */
export function emitJson(payload: unknown): Promise<void>
{
	return new Promise((resolve, reject) => {
		process.stdout.write(JSON.stringify(payload, null, 2) + '\n', (error) => (error ? reject(error) : resolve()));
	});
}
