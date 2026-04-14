export class Helper
{
	greet()
	{
		return 'hello';
	}
}

export function createHelper()
{
	return new Helper();
}
