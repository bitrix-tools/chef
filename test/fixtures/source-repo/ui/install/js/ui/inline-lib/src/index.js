import { Core } from 'main.core';

export function usedHelper()
{
	return new Core().isReady() ? 'inline-used-marker' : '';
}

export function unusedHelper()
{
	return 'inline-unused-marker';
}
