import type { TestToken } from '../test-types';

const TOKEN_MARKER = '__CHEF_TOKEN__';

export type ParsedEvent =
	| { type: 'begin'; totalTests: number; browserCount: number }
	| { type: 'status'; text: string }
	| { type: 'token'; token: TestToken; browser?: string }
	| { type: 'runError'; message: string; stack?: string }
	| { type: 'stdio'; text: string }
	| { type: 'end' };

export function parseTokenStream(buffer: string): { events: ParsedEvent[]; remaining: string }
{
	const events: ParsedEvent[] = [];

	let startIdx: number;
	while ((startIdx = buffer.indexOf(TOKEN_MARKER)) !== -1)
	{
		const endIdx = buffer.indexOf(TOKEN_MARKER, startIdx + TOKEN_MARKER.length);
		if (endIdx === -1)
		{
			break;
		}

		const json = buffer.slice(startIdx + TOKEN_MARKER.length, endIdx);
		buffer = buffer.slice(endIdx + TOKEN_MARKER.length);

		try
		{
			const data = JSON.parse(json);

			if (data.id === 'END')
			{
				events.push({ type: 'end' });
				continue;
			}

			if (data.id === 'BEGIN')
			{
				events.push({
					type: 'begin',
					totalTests: data.totalTests,
					browserCount: data.browserCount,
				});
				continue;
			}

			if (data.id === 'STATUS')
			{
				events.push({ type: 'status', text: data.text });
				continue;
			}

			if (data.id === 'RUN_ERROR')
			{
				events.push({
					type: 'runError',
					message: data.error?.message ?? 'Playwright run error',
					stack: data.error?.stack,
				});
				continue;
			}

			if (data.id === 'STDIO')
			{
				events.push({
					type: 'stdio',
					text: Buffer.from(String(data.textBase64 ?? ''), 'base64').toString('utf-8'),
				});
				continue;
			}

			const token: TestToken = {
				id: data.id,
				title: data.title,
				suite: data.suite,
				duration: data.duration,
				error: data.error,
				attachments: data.attachments,
				file: data.file,
				line: data.line,
				pending: data.pending,
				browser: data.browser,
			};

			events.push({
				type: 'token',
				token,
				browser: data.browser || undefined,
			});
		}
		catch
		{
			// Skip malformed tokens
		}
	}

	return { events, remaining: buffer };
}
