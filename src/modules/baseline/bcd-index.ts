import { createRequire } from 'node:module';

import type { BcdData, CompatEntry } from './types';

let cachedBcd: BcdData | null = null;
let cachedIndex: BcdIndex | null = null;

export function loadBcd(): BcdData
{
	if (cachedBcd === null)
	{
		const require = createRequire(import.meta.url);
		cachedBcd = require('@mdn/browser-compat-data') as BcdData;
	}

	return cachedBcd;
}

export interface BcdIndex
{
	/** Static methods and properties: "Object.hasOwn", "RegExp.escape", "Array.from". */
	staticApis: Map<string, CompatEntry>;

	/** Constructable builtins: "WeakRef", "AggregateError", "FinalizationRegistry". */
	constructors: Map<string, CompatEntry>;

	/** Globals from bcd.api: "structuredClone", "queueMicrotask", "reportError". */
	globalApis: Map<string, CompatEntry>;

	/**
	 * Instance methods grouped by method name. Several builtins share names
	 * (e.g. "at" on Array, String, TypedArray). Each entry keeps the list of
	 * (ownerLabel, compatEntry) pairs so the checker can build a combined
	 * warning and a worst-case support resolution.
	 */
	instanceMethods: Map<string, Array<{ owner: string; entry: CompatEntry }>>;
}

/**
 * Heuristic: a JavaScript builtin member like `Array.at` is an INSTANCE method
 * when its TC39 spec URL contains ".prototype.". For entries without a
 * spec URL (some experimental features), fall back to a runtime introspection
 * check via `Owner.prototype`.
 */
function isInstanceMember(owner: string, method: string, entry: CompatEntry): boolean
{
	const specRaw = (entry.__compat as any)?.spec_url;
	const specUrl: string = Array.isArray(specRaw) ? (specRaw[0] ?? '') : (specRaw ?? '');

	if (specUrl)
	{
		return specUrl.toLowerCase().includes('.prototype.');
	}

	// Fallback to runtime introspection when no spec URL is available.
	const ownerObj = (globalThis as Record<string, any>)[owner];
	if (ownerObj && typeof ownerObj.prototype === 'object' && ownerObj.prototype !== null)
	{
		try
		{
			return method in ownerObj.prototype;
		}
		catch
		{
			return false;
		}
	}

	return false;
}

const SKIPPED_KEYS = new Set([
	'__compat',
	'prototype',
	'constructor',
]);

function isSpecialKey(key: string): boolean
{
	return key.startsWith('@@') || key === key.toLowerCase() && key === 'length';
}

/**
 * Walks the entire BCD tree (no hardcoded feature lists) and builds the lookup
 * structures used by the AST checker. New APIs in future BCD releases appear
 * here automatically.
 */
export function buildBcdIndex(bcd: BcdData = loadBcd()): BcdIndex
{
	if (cachedIndex && cachedBcd === bcd)
	{
		return cachedIndex;
	}

	const staticApis = new Map<string, CompatEntry>();
	const constructors = new Map<string, CompatEntry>();
	const globalApis = new Map<string, CompatEntry>();
	const instanceMethods = new Map<string, Array<{ owner: string; entry: CompatEntry }>>();

	for (const [owner, ownerEntry] of Object.entries(bcd.javascript.builtins))
	{
		if (!ownerEntry || typeof ownerEntry !== 'object')
		{
			continue;
		}

		// Owner itself (e.g. `WeakRef`, `AggregateError`, `Promise`) — usable as a
		// constructor when its top-level `__compat` exists.
		if ((ownerEntry as CompatEntry).__compat)
		{
			constructors.set(owner, ownerEntry as CompatEntry);
		}

		for (const [member, memberEntry] of Object.entries(ownerEntry as Record<string, unknown>))
		{
			if (SKIPPED_KEYS.has(member) || isSpecialKey(member))
			{
				continue;
			}

			if (!memberEntry || typeof memberEntry !== 'object')
			{
				continue;
			}

			const entry = memberEntry as CompatEntry;
			if (!entry.__compat)
			{
				continue;
			}

			if (isInstanceMember(owner, member, entry))
			{
				const list = instanceMethods.get(member) ?? [];
				list.push({ owner, entry });
				instanceMethods.set(member, list);
			}
			else
			{
				staticApis.set(`${owner}.${member}`, entry);
			}
		}
	}

	// Globals from bcd.api — only top-level entries with compat data. Members
	// (instance methods on classes like `IntersectionObserver.observe`) are
	// handled by instance-method matching above, since BCD lists DOM prototypes
	// under their constructor name as well.
	for (const [name, entry] of Object.entries(bcd.api))
	{
		if (!entry || typeof entry !== 'object')
		{
			continue;
		}

		const compat = (entry as CompatEntry).__compat;
		if (!compat)
		{
			continue;
		}

		globalApis.set(name, entry as CompatEntry);
	}

	cachedIndex = { staticApis, constructors, globalApis, instanceMethods };
	cachedBcd = bcd;

	return cachedIndex;
}

/**
 * For instance methods that exist on several owners (e.g. `.at` on Array, String,
 * TypedArray), returns owner labels suitable for "Array.prototype.at /
 * String.prototype.at" message formatting.
 */
export function formatInstanceOwners(methodName: string, owners: Array<{ owner: string; entry: CompatEntry }>): string
{
	if (owners.length <= 2)
	{
		return owners.map(({ owner }) => `${owner}.prototype.${methodName}`).join(' / ');
	}

	return `${owners[0].owner}.prototype.${methodName}`;
}
