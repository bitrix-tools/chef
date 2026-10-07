export type TextEdit = {
	// range in the old text
	start: number;
	end: number;
	// replacement
	text: string;
};

/**
 * Myers diff of two sequences; returns the edits that turn `a` into `b` as index ranges
 * of `a` and the replacing slices of `b`.
 */
function diffSequences<T>(a: T[], b: T[]): Array<{ aStart: number; aEnd: number; bStart: number; bEnd: number }>
{
	const n = a.length;
	const m = b.length;
	const max = n + m;
	const offset = max + 1;
	const v = new Array<number>(2 * max + 3).fill(0);
	const trace: number[][] = [];

	outer:
	for (let d = 0; d <= max; d++)
	{
		trace.push(v.slice());
		for (let k = -d; k <= d; k += 2)
		{
			let x = (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]))
				? v[offset + k + 1]
				: v[offset + k - 1] + 1;
			let y = x - k;
			while (x < n && y < m && a[x] === b[y])
			{
				x++;
				y++;
			}

			v[offset + k] = x;
			if (x >= n && y >= m)
			{
				trace.push(v.slice());
				break outer;
			}
		}
	}

	// walk back through the trace, collecting the non-matching stretches
	const hunks: Array<{ aStart: number; aEnd: number; bStart: number; bEnd: number }> = [];
	let x = n;
	let y = m;
	for (let d = trace.length - 2; d >= 0 && (x > 0 || y > 0); d--)
	{
		const vd = trace[d];
		const k = x - y;
		const prevK = (k === -d || (k !== d && vd[offset + k - 1] < vd[offset + k + 1])) ? k + 1 : k - 1;
		const prevX = vd[offset + prevK];
		const prevY = prevX - prevK;

		while (x > prevX && y > prevY)
		{
			x--;
			y--;
		}

		if (d > 0)
		{
			const last = hunks.at(-1);
			if (last && last.aStart === x && last.bStart === y)
			{
				last.aStart = prevX;
				last.bStart = prevY;
			}
			else
			{
				hunks.push({ aStart: prevX, aEnd: x, bStart: prevY, bEnd: y });
			}
		}

		x = prevX;
		y = prevY;
	}

	return hunks.reverse();
}

/**
 * Character edits that turn `before` into `after`. Lines are diffed first and characters
 * only inside the changed lines, which keeps it fast on whole files.
 */
export function diffText(before: string, after: string): TextEdit[]
{
	const split = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
	const beforeLines = split(before);
	const afterLines = split(after);
	const beforeStarts: number[] = [];
	const afterStarts: number[] = [];
	let position = 0;
	for (const line of beforeLines)
	{
		beforeStarts.push(position);
		position += line.length;
	}
	beforeStarts.push(position);
	position = 0;
	for (const line of afterLines)
	{
		afterStarts.push(position);
		position += line.length;
	}
	afterStarts.push(position);

	const edits: TextEdit[] = [];
	for (const hunk of diffSequences(beforeLines, afterLines))
	{
		const aStart = beforeStarts[hunk.aStart];
		const aText = before.slice(aStart, beforeStarts[hunk.aEnd]);
		const bText = after.slice(afterStarts[hunk.bStart], afterStarts[hunk.bEnd]);

		// code points, so that a surrogate pair is never split; mapped back to UTF-16 below
		const aChars = [...aText];
		const bChars = [...bText];
		for (const charHunk of diffSequences(aChars, bChars))
		{
			const startA = aStart + aChars.slice(0, charHunk.aStart).join('').length;
			const endA = aStart + aChars.slice(0, charHunk.aEnd).join('').length;
			edits.push({
				start: startA,
				end: endA,
				text: bChars.slice(charHunk.bStart, charHunk.bEnd).join(''),
			});
		}
	}

	return edits;
}

/**
 * Applies the edits a fix made to a shadow copy to the original text. `changed` are the
 * positions where the copy differs from the original.
 *
 * Edits inside `skipRanges` are left out. An edit that only adds or removes whitespace
 * at changed positions fixes the
 * transformation itself (a blanked `?` reads as a double space) and is skipped. Any other
 * edit touching a changed position cannot be carried over: then null is returned and the
 * original is left as it was. Otherwise returns the new text and where the changed
 * positions moved to.
 */
export function carryOverEdits(
	original: string,
	edits: TextEdit[],
	changed: number[],
	// edits inside these ranges are not carried over
	skipRanges: Array<[number, number]> = [],
): { text: string; changed: number[] } | null
{
	const changedSet = new Set(changed);
	const kept: TextEdit[] = [];
	for (const edit of edits)
	{
		if (skipRanges.some(([start, end]) => edit.start >= start && edit.end <= end))
		{
			continue;
		}

		let touches = false;
		let whitespaceOnly = /^\s*$/.test(edit.text);
		for (let i = edit.start; i < edit.end; i++)
		{
			if (changedSet.has(i))
			{
				touches = true;
			}
			else if (!/\s/.test(original[i]))
			{
				whitespaceOnly = false;
			}
		}

		if (!touches && edit.start === edit.end && (changedSet.has(edit.start) || changedSet.has(edit.start - 1)))
		{
			touches = whitespaceOnly;
		}

		if (!touches)
		{
			kept.push(edit);
		}
		else if (!whitespaceOnly)
		{
			return null;
		}
	}

	let text = '';
	let position = 0;
	for (const edit of kept)
	{
		text += original.slice(position, edit.start) + edit.text;
		position = edit.end;
	}
	text += original.slice(position);

	const moved = changed.map((index) => {
		let shift = 0;
		for (const edit of kept)
		{
			if (edit.end <= index)
			{
				shift += edit.text.length - (edit.end - edit.start);
			}
		}

		return index + shift;
	});

	return { text, changed: moved };
}
