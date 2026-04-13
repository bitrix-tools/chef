const handlers = [];

export function registerHandler(handler)
{
	handlers.push(handler);
}

export function getHandlers()
{
	return handlers;
}
