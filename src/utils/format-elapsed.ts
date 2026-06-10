// Human-readable elapsed time that scales with magnitude:
//   < 1ms        → "< 1ms"
//   < 1s         → "742ms"
//   < 1min       → "12.34s"   (sub-minute precision)
//   < 1h         → "23m 05s"
//   otherwise    → "1h 12m"
// So a long test run reads as "23m 05s" instead of "1385.52s".
export function formatElapsed(ms: number): string
{
	if (ms < 1)
	{
		return '< 1ms';
	}

	if (ms < 1000)
	{
		return `${Math.round(ms)}ms`;
	}

	const totalSeconds = Math.round(ms / 1000);

	if (totalSeconds < 60)
	{
		return `${(ms / 1000).toFixed(2)}s`;
	}

	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0)
	{
		return `${hours}h ${String(minutes).padStart(2, '0')}m`;
	}

	return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}
