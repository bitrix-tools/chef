// Auto-index: directory import without explicit /index
import { greet } from './lib';

// Auto-index with trailing slash
import { hello } from './lib/';

export function go(): string
{
	return `${greet('world')} | ${hello}`;
}
