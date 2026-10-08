import fs from 'node:fs';
import fg from 'fast-glob';
import { parseSync } from 'oxc-parser';
import { prepareSource } from '../src/modules/engines/lint/oxlint/prepare-source';
const root = '/Users/belov/Projects/modules/.worktrees/oxlint-pilot';
const files = await fg(['*/install/js/**/src/**/*.js', '*/install/components/**/src/**/*.js'], { cwd: root, absolute: true, ignore: ['**/node_modules/**', '**/dist/**', '**/vendor/**'] });
const kinds: Record<string, number> = {}; const reasons: Record<string, number> = {};
for (const f of files) {
	const t = fs.readFileSync(f, 'utf8'); const p: any = prepareSource(f, t); kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
	if (p.text && p.text.length !== t.length) console.log('LENGTH MISMATCH', f);
	if (p.kind === 'stripped') {
		const e: any = parseSync(f + '.ts', t, { lang: 'ts', showSemanticErrors: true }).errors.find((x: any) => !x.message.startsWith("'?' at the start"));
		const key = e ? e.message.slice(0, 50) : 'none'; reasons[key] = (reasons[key] ?? 0) + 1;
	}
}
console.log(files.length, kinds); console.log(Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 8));
