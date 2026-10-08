import type { PreparedSource } from './prepare-source';

export type ShadowPrepared = Exclude<PreparedSource, { kind: 'native' | 'unparsable' }>;

// Formatting rules that look at text, not at syntax: ESLint applied them to Flow types too.
const TEXT_RULES = new Set([
	'eol-last',
	'linebreak-style',
	'max-len',
	'no-mixed-spaces-and-tabs',
	'no-multiple-empty-lines',
	'no-trailing-spaces',
	'spaced-comment',
]);

const IDENTIFIER = /^[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*$/u;

/**
 * Tells the diagnostics of a shadow copy that describe the transformation, not the code:
 * - a short span at a change, or separated from it by spaces only (a blanked `?` makes a
 *   double space, a blanked `type X` leaves a trailing comma in an import);
 * - blank lines left by blanked types;
 * - an unused import that the original uses in blanked types only;
 * - formatting inside Flow type annotations: ESLint did not format Flow types.
 *
 * A span over lines (a class member, a function) only contains changes and still
 * describes the code, unless it starts at one.
 */
export class TransformationArtifacts
{
	readonly #original: string;
	readonly #prepared: ShadowPrepared;
	readonly #changed: number[];

	constructor(original: string, prepared: ShadowPrepared)
	{
		this.#original = original;
		this.#prepared = prepared;
		this.#changed = [...prepared.changed].sort((a, b) => a - b);
	}

	/**
	 * @param code - oxlint rule code, `plugin(rule)`
	 * @param start - start of the span in the prepared text, UTF-16
	 * @param end - end of the span in the prepared text, UTF-16
	 */
	has(code: string | undefined, start: number, end: number): boolean
	{
		// transformations keep the length of every line
		if (!code || code === '@stylistic(max-len)')
		{
			return false;
		}

		const text = this.#prepared.text;
		let from = start;
		while (from > 0 && (text[from - 1] === ' ' || text[from - 1] === '\t'))
		{
			from--;
		}

		let to = end;
		while (to < text.length && (text[to] === ' ' || text[to] === '\t'))
		{
			to++;
		}

		const multiline = text.lastIndexOf('\n', end - 1) >= start;
		const blank = multiline && text.slice(start, end).trim() === '';
		if (this.#touchesChange(from - 1, multiline && !blank ? start : to))
		{
			return true;
		}

		return this.#isUsedInBlankedTypes(code, start, end) || this.#isTypeFormatting(code, start);
	}

	// is there a changed position within [start, end]?
	#touchesChange(start: number, end: number): boolean
	{
		let low = 0;
		let high = this.#changed.length;
		while (low < high)
		{
			const middle = (low + high) >> 1;
			if (this.#changed[middle] < start)
			{
				low = middle + 1;
			}
			else
			{
				high = middle;
			}
		}

		return low < this.#changed.length && this.#changed[low] <= end;
	}

	#isUsedInBlankedTypes(code: string, start: number, end: number): boolean
	{
		if (code !== 'eslint(no-unused-vars)')
		{
			return false;
		}

		const name = this.#prepared.text.slice(start, end);
		if (!IDENTIFIER.test(name))
		{
			return false;
		}

		const escaped = name.replaceAll('$', '\\$');
		for (const match of this.#original.matchAll(new RegExp(`(?<![\\p{ID_Continue}$])${escaped}(?![\\p{ID_Continue}$])`, 'gu')))
		{
			if (this.#touchesChange(match.index, match.index))
			{
				return true;
			}
		}

		return false;
	}

	#isTypeFormatting(code: string, start: number): boolean
	{
		if (this.#prepared.kind !== 'flow-as-ts')
		{
			return false;
		}

		const match = /^@stylistic\((.+)\)$/.exec(code);
		if (!match || TEXT_RULES.has(match[1]))
		{
			return false;
		}

		// a missing semicolon after `type A = {...}` is reported right at its end
		const inclusiveEnd = match[1] === 'semi';

		return this.#prepared.typeRanges.some(([from, to]) => start >= from && (start < to || (inclusiveEnd && start === to)));
	}
}
