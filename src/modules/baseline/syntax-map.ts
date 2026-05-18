import type { CompatEntry } from './types';
import { loadBcd } from './bcd-index';

/**
 * Maps from Babel AST node identifiers (type + optional discriminator)
 * to BCD operator/statement keys. This is the only "table" in the checker
 * because BCD and Babel use different naming conventions for the same
 * syntactic constructs — neither side can be derived from the other.
 *
 * Entry format: { key: BCD operator name, match: (node) => boolean }
 */
type SyntaxRule = {
	bcdKey: string;
	label: string;
	match: (node: any) => boolean;
};

const syntaxRules: SyntaxRule[] = [
	{
		bcdKey: 'optional_chaining',
		label: 'optional chaining (?.)',
		match: (node) => node.type === 'OptionalMemberExpression' || node.type === 'OptionalCallExpression' || node.type === 'ChainExpression',
	},
	{
		bcdKey: 'nullish_coalescing',
		label: 'nullish coalescing (??)',
		match: (node) => node.type === 'LogicalExpression' && node.operator === '??',
	},
	{
		bcdKey: 'nullish_coalescing_assignment',
		label: 'nullish coalescing assignment (??=)',
		match: (node) => node.type === 'AssignmentExpression' && node.operator === '??=',
	},
	{
		bcdKey: 'logical_and_assignment',
		label: 'logical AND assignment (&&=)',
		match: (node) => node.type === 'AssignmentExpression' && node.operator === '&&=',
	},
	{
		bcdKey: 'logical_or_assignment',
		label: 'logical OR assignment (||=)',
		match: (node) => node.type === 'AssignmentExpression' && node.operator === '||=',
	},
	{
		bcdKey: 'exponentiation',
		label: 'exponentiation (**)',
		match: (node) => node.type === 'BinaryExpression' && node.operator === '**',
	},
	{
		bcdKey: 'spread',
		label: 'spread (...)',
		match: (node) => node.type === 'SpreadElement',
	},
];

const cachedEntries = new Map<string, CompatEntry | null>();

function getSyntaxEntry(bcdKey: string): CompatEntry | null
{
	if (cachedEntries.has(bcdKey))
	{
		return cachedEntries.get(bcdKey)!;
	}

	const bcd = loadBcd();
	const entry = (bcd.javascript.operators as Record<string, CompatEntry | undefined>)[bcdKey];
	const value = entry?.__compat ? entry : null;
	cachedEntries.set(bcdKey, value);

	return value;
}

export function findSyntaxFeature(node: any): { bcdKey: string; label: string; entry: CompatEntry } | null
{
	for (const rule of syntaxRules)
	{
		if (rule.match(node))
		{
			const entry = getSyntaxEntry(rule.bcdKey);
			if (entry)
			{
				return { bcdKey: rule.bcdKey, label: rule.label, entry };
			}
		}
	}

	return null;
}

export function getAllSyntaxRules(): readonly SyntaxRule[]
{
	return syntaxRules;
}
