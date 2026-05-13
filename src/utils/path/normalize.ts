import * as path from 'node:path';

/**
 * Normalises a filesystem path to POSIX form (forward slashes, no "./" / ".."
 * segments). Backslashes are converted to forward slashes on every platform.
 * Bitrix extensions never use backslashes in source paths, and chef routinely
 * operates on strings produced on a foreign host (source maps, stack traces,
 * JSON from a Windows CI build), so an unconditional conversion is safer
 * than gating on `process.platform`.
 *
 * Use this at the boundary whenever a path leaves chef as a string to be
 * consumed by something that expects POSIX-style separators:
 * - JSON output (aliases.tsconfig.json, --json reports, source maps)
 * - glob patterns
 * - URL construction (file:// — prefer pathToFileURL where applicable)
 * - cross-platform string comparisons of paths
 *
 * FS calls in Node.js (`fs.*`, `path.join`, etc.) accept both separators on
 * Windows, so there is no need to convert back to native form before
 * passing the result to Node.js APIs.
 *
 * When you need a **native-form** path for Map keys / FS comparisons (e.g.
 * deduplicating directories returned by a glob that emits forward slashes
 * on Windows), use `path.normalize(value)` — that produces the canonical
 * native string for the current platform.
 */
export function normalizePath(value: string): string
{
	return path.posix.normalize(value.replaceAll('\\', '/'));
}

/**
 * Same as `normalizePath`, but for free-form text (diagnostic messages, stack traces,
 * etc.) that may contain both filesystem paths AND URLs. Plain `normalizePath` collapses
 * `https://...` to `https:/...` via `path.posix.normalize`. This variant only converts
 * Windows-style backslashes — duplicate forward slashes (URL `//`, UNC paths) are left
 * untouched, since collapsing them changes the meaning of the surrounding text.
 */
export function normalizeMessagePaths(message: string): string
{
	if (!message.includes('\\')) return message;
	return message.replaceAll('\\', '/');
}

/**
 * Returns true if `value` is an absolute path on any platform — that is, a
 * POSIX absolute ("/foo") *or* a Windows absolute ("C:\\foo" / "C:/foo").
 *
 * Use this when interpreting paths produced on a foreign system: source map
 * `sources`, stack-trace frames, paths persisted by a CI build on a
 * different OS. Plain `path.isAbsolute` only recognises the current
 * platform's convention.
 */
export function isAbsoluteAnyPlatform(value: string): boolean
{
	return path.posix.isAbsolute(value) || path.win32.isAbsolute(value);
}
