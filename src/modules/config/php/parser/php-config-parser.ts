export class PhpConfigParser
{
	parse(phpCode: string): Record<string, any>
	{
		const returnIndex = phpCode.indexOf('return');
		if (returnIndex === -1)
		{
			return {};
		}

		const afterReturn = phpCode.substring(returnIndex + 'return'.length).trimStart();
		if (!afterReturn.startsWith('['))
		{
			return {};
		}

		const reader = new PhpArrayReader(afterReturn);
		const result = reader.readValue();

		if (result !== null && typeof result === 'object' && !Array.isArray(result))
		{
			return result;
		}

		return {};
	}
}

class PhpArrayReader
{
	#source: string;
	#position: number = 0;

	constructor(source: string)
	{
		this.#source = source;
	}

	readValue(): any
	{
		this.#skipWhitespaceAndComments();

		const char = this.#peek();

		if (char === '[')
		{
			return this.#readArray();
		}

		if (char === "'" || char === '"')
		{
			return this.#readString();
		}

		if (char === '-' || isDigit(char))
		{
			return this.#readNumber();
		}

		// Keywords: true, false, null
		const keyword = this.#readKeyword();
		if (keyword !== undefined)
		{
			return keyword;
		}

		// Unknown expression (variable, function call, constant, etc.) — skip it
		this.#skipExpression();

		return undefined;
	}

	#readArray(): any
	{
		// Skip opening '['
		this.#advance();
		this.#skipWhitespaceAndComments();

		if (this.#peek() === ']')
		{
			this.#advance();
			return [];
		}

		// Peek ahead to determine if this is an associative array
		const isAssociative = this.#isAssociativeArray();

		if (isAssociative)
		{
			return this.#readAssociativeArray();
		}

		return this.#readIndexedArray();
	}

	#isAssociativeArray(): boolean
	{
		// Save position, scan for '=>' before ']' or '['
		const saved = this.#position;
		let depth = 0;

		while (this.#position < this.#source.length)
		{
			const char = this.#peek();

			if (char === '[')
			{
				depth++;
			}
			else if (char === ']')
			{
				if (depth === 0)
				{
					break;
				}

				depth--;
			}
			else if (depth === 0 && char === '=' && this.#source[this.#position + 1] === '>')
			{
				this.#position = saved;
				return true;
			}
			else if (char === "'" || char === '"')
			{
				this.#skipStringFast(char);
				continue;
			}

			this.#advance();
		}

		this.#position = saved;
		return false;
	}

	#readAssociativeArray(): Record<string, any>
	{
		const result: Record<string, any> = {};

		while (this.#position < this.#source.length)
		{
			this.#skipWhitespaceAndComments();

			if (this.#peek() === ']')
			{
				this.#advance();
				return result;
			}

			// Read key
			const key = this.readValue();
			if (key === undefined)
			{
				// Couldn't parse key — skip to end of array
				this.#skipToArrayEnd();
				return result;
			}

			this.#skipWhitespaceAndComments();

			// Expect '=>'
			if (this.#peek() === '=' && this.#source[this.#position + 1] === '>')
			{
				this.#position += 2;
			}
			else
			{
				this.#skipToArrayEnd();
				return result;
			}

			// Read value
			const value = this.readValue();
			result[String(key)] = value;

			this.#skipWhitespaceAndComments();

			// Skip comma
			if (this.#peek() === ',')
			{
				this.#advance();
			}
		}

		return result;
	}

	#readIndexedArray(): any[]
	{
		const result: any[] = [];

		while (this.#position < this.#source.length)
		{
			this.#skipWhitespaceAndComments();

			if (this.#peek() === ']')
			{
				this.#advance();
				return result;
			}

			const value = this.readValue();
			result.push(value);

			this.#skipWhitespaceAndComments();

			// Skip comma
			if (this.#peek() === ',')
			{
				this.#advance();
			}
		}

		return result;
	}

	#readString(): string
	{
		const quote = this.#peek();
		this.#advance();
		let value = '';

		while (this.#position < this.#source.length)
		{
			const char = this.#peek();

			if (char === '\\')
			{
				this.#advance();
				const escaped = this.#peek();
				this.#advance();

				if (escaped === 'n')
				{
					value += '\n';
				}
				else if (escaped === 't')
				{
					value += '\t';
				}
				else if (escaped === 'r')
				{
					value += '\r';
				}
				else
				{
					value += escaped;
				}

				continue;
			}

			if (char === quote)
			{
				this.#advance();

				// Check for string concatenation with '.'
				this.#skipWhitespaceAndComments();
				if (this.#peek() === '.')
				{
					this.#advance();
					this.#skipWhitespaceAndComments();

					const next = this.readValue();
					if (typeof next === 'string')
					{
						return value + next;
					}

					// Concatenation with non-string (variable, constant) — return what we have
					return value;
				}

				return value;
			}

			value += char;
			this.#advance();
		}

		return value;
	}

	#readNumber(): number
	{
		let numStr = '';

		if (this.#peek() === '-')
		{
			numStr += '-';
			this.#advance();
		}

		while (this.#position < this.#source.length)
		{
			const char = this.#peek();
			if (isDigit(char) || char === '.')
			{
				numStr += char;
				this.#advance();
			}
			else
			{
				break;
			}
		}

		return parseFloat(numStr);
	}

	#readKeyword(): any
	{
		const remaining = this.#source.substring(this.#position);

		for (const [keyword, value] of KEYWORDS)
		{
			if (remaining.startsWith(keyword) && !isIdentChar(remaining[keyword.length]))
			{
				this.#position += keyword.length;
				return value;
			}
		}

		return undefined;
	}

	#skipExpression(): void
	{
		// Skip a PHP expression we don't understand (variable, function call, constant, closure, etc.)
		// We need to handle balanced brackets and string literals
		let depth = 0;

		while (this.#position < this.#source.length)
		{
			const char = this.#peek();

			if (char === "'" || char === '"')
			{
				this.#skipStringFast(char);
				continue;
			}

			if (char === '(' || char === '[' || char === '{')
			{
				depth++;
				this.#advance();
				continue;
			}

			if (char === ')' || char === ']' || char === '}')
			{
				if (depth === 0)
				{
					return;
				}

				depth--;
				this.#advance();
				continue;
			}

			if (depth === 0 && (char === ',' || char === ';'))
			{
				return;
			}

			this.#advance();
		}
	}

	#skipToArrayEnd(): void
	{
		let depth = 1;

		while (this.#position < this.#source.length)
		{
			const char = this.#peek();

			if (char === "'" || char === '"')
			{
				this.#skipStringFast(char);
				continue;
			}

			if (char === '[')
			{
				depth++;
			}
			else if (char === ']')
			{
				depth--;
				if (depth === 0)
				{
					this.#advance();
					return;
				}
			}

			this.#advance();
		}
	}

	#skipStringFast(quote: string): void
	{
		this.#advance(); // opening quote

		while (this.#position < this.#source.length)
		{
			const char = this.#peek();

			if (char === '\\')
			{
				this.#advance();
				this.#advance();
				continue;
			}

			if (char === quote)
			{
				this.#advance();
				return;
			}

			this.#advance();
		}
	}

	#skipWhitespaceAndComments(): void
	{
		while (this.#position < this.#source.length)
		{
			const char = this.#peek();

			if (char === ' ' || char === '\t' || char === '\n' || char === '\r')
			{
				this.#advance();
				continue;
			}

			// Line comment: //
			if (char === '/' && this.#source[this.#position + 1] === '/')
			{
				while (this.#position < this.#source.length && this.#peek() !== '\n')
				{
					this.#advance();
				}

				continue;
			}

			// Block comment: /* */
			if (char === '/' && this.#source[this.#position + 1] === '*')
			{
				this.#position += 2;

				while (this.#position < this.#source.length)
				{
					if (this.#peek() === '*' && this.#source[this.#position + 1] === '/')
					{
						this.#position += 2;
						break;
					}

					this.#advance();
				}

				continue;
			}

			// Hash comment: #
			if (char === '#')
			{
				while (this.#position < this.#source.length && this.#peek() !== '\n')
				{
					this.#advance();
				}

				continue;
			}

			break;
		}
	}

	#peek(): string
	{
		return this.#source[this.#position];
	}

	#advance(): void
	{
		this.#position++;
	}
}

const KEYWORDS: Array<[string, any]> = [
	['true', true],
	['false', false],
	['null', null],
];

function isDigit(char: string): boolean
{
	return char >= '0' && char <= '9';
}

function isIdentChar(char: string): boolean
{
	if (!char)
	{
		return false;
	}

	const code = char.charCodeAt(0);

	return (
		(code >= 65 && code <= 90) // A-Z
		|| (code >= 97 && code <= 122) // a-z
		|| (code >= 48 && code <= 57) // 0-9
		|| code === 95 // _
	);
}
