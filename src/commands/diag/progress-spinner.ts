import chalk from 'chalk';

const isTTY = process.stdout.isTTY ?? false;

const SPINNER_COLORS = [
	chalk.hex('#ff6b6b'),
	chalk.hex('#ffa06b'),
	chalk.hex('#ffd06b'),
	chalk.hex('#6bffa0'),
	chalk.hex('#6bd0ff'),
	chalk.hex('#a06bff'),
	chalk.hex('#ff6bd0'),
	chalk.hex('#ff6b9a'),
];
const SPINNER_INTERVAL = 100;

type Spinner = {
	update: (text: string) => void;
	stop: () => void;
};

export function createSpinner(initialText: string): Spinner
{
	let frame = 0;
	let text = initialText;
	let timer: ReturnType<typeof setInterval> | null = null;

	if (isTTY)
	{
		timer = setInterval(() => {
			const colorFn = SPINNER_COLORS[frame % SPINNER_COLORS.length];
			frame++;
			process.stdout.write(`\r\x1B[2K${colorFn('○')} ${text}`);
		}, SPINNER_INTERVAL);
	}

	return {
		update(newText: string)
		{
			text = newText;
		},
		stop()
		{
			if (timer)
			{
				clearInterval(timer);
				process.stdout.write('\r\x1B[2K');
				timer = null;
			}
		},
	};
}
