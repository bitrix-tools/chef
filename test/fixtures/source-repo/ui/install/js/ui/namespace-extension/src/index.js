export class NamespaceComponent
{
	greet()
	{
		return 'hello';
	}
}

export function createComponent()
{
	return new NamespaceComponent();
}
