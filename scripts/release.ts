import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkgPath = resolve(import.meta.dirname, '../package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const currentVersion: string = pkg.version;

const type = process.argv[2];

if (!type)
{
	console.log(`Current version: ${currentVersion}\n`);
	console.log('Usage: npm run release -- <type>\n');
	console.log('Types:');
	console.log('  beta          0.0.0-beta.12 → 0.0.0-beta.13');
	console.log('  patch         0.0.0-beta.13 → 0.0.0');
	console.log('  minor         0.0.0 → 0.1.0');
	console.log('  major         0.1.0 → 1.0.0');
	console.log('  1.2.3         explicit version');
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
			// 1.0.0-beta.11 → 1.0.0-beta.12
			return `${preMatch[1]}-${preMatch[2]}.${Number(preMatch[3]) + 1}`;
		}

		if (stableMatch)
		{
			// 1.0.1 → 1.0.2-beta.1
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

	// Explicit version
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

// Update package.json
pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const run = (cmd: string) => {
	console.log(`$ ${cmd}`);
	execSync(cmd, { stdio: 'inherit' });
};

run(`git add package.json`);
run(`git commit -m "release: ${tag}"`);
run(`git tag ${tag}`);
run(`git push`);
run(`git push origin ${tag}`);
run(`gh release create ${tag} --title "${tag}" --generate-notes`);

console.log(`\nDone! Release ${tag} created.`);
console.log('CI will publish to npm and update changelog.');
