/**
 * Positions in a source text. oxlint reports byte offsets into the UTF-8 text, editors and
 * ESLint count columns in UTF-16 code units; this converts between the two.
 */
export class TextPositions
{
	readonly #text: string;
	readonly #lineStarts: number[] = [0];
	#byteLineStarts: number[] | null = null;

	constructor(text: string)
	{
		this.#text = text;
		for (let i = 0; i < text.length; i++)
		{
			if (text.charCodeAt(i) === 10)
			{
				this.#lineStarts.push(i + 1);
			}
		}
	}

	/**
	 * UTF-16 index of a UTF-8 byte offset.
	 */
	indexOfByteOffset(byteOffset: number): number
	{
		if (!this.#byteLineStarts)
		{
			this.#byteLineStarts = [];
			let bytes = 0;
			let previous = 0;
			for (const start of this.#lineStarts)
			{
				bytes += Buffer.byteLength(this.#text.slice(previous, start));
				this.#byteLineStarts.push(bytes);
				previous = start;
			}
		}

		const line = this.#lineOf(this.#byteLineStarts, byteOffset);
		const lineStart = this.#lineStarts[line];
		const lineEnd = this.#lineStarts[line + 1] ?? this.#text.length;
		const lineBytes = Buffer.from(this.#text.slice(lineStart, lineEnd));

		return lineStart + lineBytes.subarray(0, byteOffset - this.#byteLineStarts[line]).toString('utf8').length;
	}

	/**
	 * 1-based line and column (in UTF-16 code units) of a UTF-16 index.
	 */
	locationOf(index: number): { line: number; column: number }
	{
		const line = this.#lineOf(this.#lineStarts, index);

		return { line: line + 1, column: index - this.#lineStarts[line] + 1 };
	}

	#lineOf(starts: number[], offset: number): number
	{
		let low = 0;
		let high = starts.length - 1;
		while (low < high)
		{
			const middle = (low + high + 1) >> 1;
			if (starts[middle] <= offset)
			{
				low = middle;
			}
			else
			{
				high = middle - 1;
			}
		}

		return low;
	}
}
