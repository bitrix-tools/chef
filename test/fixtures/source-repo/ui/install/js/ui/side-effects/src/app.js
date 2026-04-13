import './greeting-handler';
import { getHandlers } from './registry';

export class App
{
	run()
	{
		return getHandlers();
	}
}
