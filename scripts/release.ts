import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkgPath = resolve(import.meta.dirname, '../package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const currentVersion: string = pkg.version;

const type = process.argv[2];
const notesRu = process.argv[3];
const notesEn = process.argv[4];

if (!type)
{
	console.log(`Current version: ${currentVersion}\n`);
	console.log('Usage: npm run release -- <type> "RU описание" "EN description"\n');
	console.log('Types:');
	console.log('  beta          0.0.0-beta.12 → 0.0.0-beta.13');
	console.log('  patch         0.0.0-beta.13 → 0.0.0');
	console.log('  minor         0.0.0 → 0.1.0');
	console.log('  major         0.1.0 → 1.0.0');
	console.log('  1.2.3         explicit version');
	process.exit(1);
}

if (!notesRu || !notesEn)
{
	console.error('Both RU and EN release notes are required:');
	console.error('  npm run release -- <type> "RU описание" "EN description"');
	process.exit(1);
}

function bumpVersion(current: string, type: string): string
{
	const preMatch = current.match(/^(\d+\.\d+\.\d+)-(\w+)\.(\d+)$/);
	const stableMatch = current.match(/^(\d+)\.(\d+)\.(\d+)$/);

	if (type === 'beta')
	{
		if (preMatch)
		{
			return `${preMatch[1]}-${preMatch[2]}.${Number(preMatch[3]) + 1}`;
		}

		if (stableMatch)
		{
			const patch = Number(stableMatch[3]) + 1;
			return `${stableMatch[1]}.${stableMatch[2]}.${patch}-beta.1`;
		}
	}

	if (type === 'patch')
	{
		const base = preMatch ? preMatch[1] : current;
		const [major, minor, patch] = base.split('.').map(Number);
		return `${major}.${minor}.${patch + (preMatch ? 0 : 1)}`;
	}

	if (type === 'minor')
	{
		const base = preMatch ? preMatch[1] : current;
		const [major, minor] = base.split('.').map(Number);
		return `${major}.${minor + 1}.0`;
	}

	if (type === 'major')
	{
		const base = preMatch ? preMatch[1] : current;
		const [major] = base.split('.').map(Number);
		return `${major + 1}.0.0`;
	}

	if (/^\d+\.\d+\.\d+/.test(type))
	{
		return type;
	}

	console.error(`Unknown release type: ${type}`);
	process.exit(1);
}

const newVersion = bumpVersion(currentVersion, type);
const tag = `v${newVersion}`;

console.log(`${currentVersion} → ${newVersion}\n`);

const run = (cmd: string) => {
	console.log(`$ ${cmd}`);
	execSync(cmd, { stdio: 'inherit' });
};

// Sync with origin first: the previous release's CI pushes a changelog commit to
// main asynchronously, so a release soon after would fail to push (non-fast-forward).
// Rebase before bumping so the version commit lands on top of the latest main.
run(`git pull --rebase`);

pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

run(`git add package.json`);
run(`git commit -m "release: ${tag}"`);
run(`git tag ${tag}`);
run(`git push`);
run(`git push origin ${tag}`);

const releaseNotes = `${notesRu}\n\n---\n\n${notesEn}`;
const notesFile = resolve(import.meta.dirname, '../.release-notes.tmp');
writeFileSync(notesFile, releaseNotes);
run(`gh release create ${tag} --title "${tag}" --notes-file .release-notes.tmp`);
execSync(`rm -f ${notesFile}`);

console.log(`\nDone! Release ${tag} created.`);
console.log('CI will publish to npm and update changelog.');
