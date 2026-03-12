import iconUrl from './images/icon.svg';

export class Icon
{
	render()
	{
		const img = document.createElement('img');
		img.src = iconUrl;

		return img;
	}
}
