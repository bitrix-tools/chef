import { registerHandler } from './registry';

class GreetingHandler
{
	handle()
	{
		return 'hello';
	}
}

registerHandler(GreetingHandler);
