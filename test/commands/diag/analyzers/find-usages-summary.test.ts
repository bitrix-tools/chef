import { assert } from 'chai';

import { summarizeUsages, filterUsages } from '../../../../src/commands/diag/analyzers/find-usages-summary';

import type { UsageLocation } from '../../../../src/commands/diag/analyzers/find-usages-analyzer';

function usage(
	type: UsageLocation['type'],
	file: string,
	line = 1,
	details?: UsageLocation['details'],
): UsageLocation
{
	return { type, file, line, content: '', ...(details ? { details } : {}) };
}

describe('summarizeUsages', () => {
	it('counts unique files per import name', () => {
		const usages: UsageLocation[] = [
			usage('js-import', '/repo/a/install/js/a/x/src/i.js', 1, { imports: ['UI'] }),
			usage('js-import', '/repo/a/install/js/a/x/src/i.js', 5, { imports: ['UI'] }),
			usage('js-import', '/repo/b/install/js/b/y/src/i.js', 1, { imports: ['UI', 'Manager'] }),
			usage('js-import', '/repo/c/install/js/c/z/src/i.js', 1, { imports: [] }),
		];

		const summary = summarizeUsages(usages);

		const ui = summary.imports.find((it) => it.name === 'UI');
		const manager = summary.imports.find((it) => it.name === 'Manager');
		const side = summary.imports.find((it) => it.name === '(side-effect)');

		assert.equal(ui?.files, 2, 'UI imported in 2 files (not 3 — same file counted once)');
		assert.equal(manager?.files, 1);
		assert.equal(side?.files, 1);
	});

	it('counts unique files per namespace prefix', () => {
		const usages: UsageLocation[] = [
			usage('js-namespace', '/x/a/install/js/a/i.js', 1, { namespace: 'BX.UI.Notification.Center' }),
			usage('js-namespace', '/x/a/install/js/a/i.js', 5, { namespace: 'BX.UI.Notification.Center' }),
			usage('js-namespace', '/x/b/install/js/b/i.js', 1, { namespace: 'BX.UI.Notification.Balloon' }),
		];

		const summary = summarizeUsages(usages);
		assert.deepEqual(
			summary.namespaces.map((it) => [it.name, it.files]),
			[
				['BX.UI.Notification.Balloon', 1],
				['BX.UI.Notification.Center', 1],
			],
		);
	});

	it('extracts module name from install layout', () => {
		const usages: UsageLocation[] = [
			usage('js-import', '/Users/belov/repo/crm/install/js/crm/foo/i.js'),
			usage('js-import', '/Users/belov/repo/crm/install/components/bitrix/x/y.js'),
			usage('js-import', '/Users/belov/repo/tasks/install/js/tasks/bar/i.js'),
		];

		const summary = summarizeUsages(usages);
		assert.equal(summary.totalModules, 2);
		const crm = summary.topModules.find((it) => it.name === 'crm');
		const tasks = summary.topModules.find((it) => it.name === 'tasks');
		assert.equal(crm?.files, 2);
		assert.equal(tasks?.files, 1);
	});

	it('totals match input regardless of detail completeness', () => {
		const usages: UsageLocation[] = [
			usage('js-import', '/x/a/install/js/a/i.js'),
			usage('js-import', '/x/a/install/js/a/i.js', 5),
			usage('php-extension-load', '/x/a/install/components/bitrix/c/t.php'),
		];

		const summary = summarizeUsages(usages);
		assert.equal(summary.totalUsages, 3);
		assert.equal(summary.totalFiles, 2);
		assert.equal(summary.byType['js-import'], 2);
		assert.equal(summary.byType['php-extension-load'], 1);
	});

	it('attaches locations sorted by file path', () => {
		const usages: UsageLocation[] = [
			usage('js-import', '/repo/z/install/js/z/i.js', 10, { imports: ['UI'] }),
			usage('js-import', '/repo/a/install/js/a/i.js', 7, { imports: ['UI'] }),
			usage('js-import', '/repo/m/install/js/m/i.js', 3, { imports: ['UI'] }),
		];

		const summary = summarizeUsages(usages);
		const ui = summary.imports.find((it) => it.name === 'UI');

		assert.equal(ui?.files, 3);
		assert.deepEqual(ui?.locations, [
			{ file: '/repo/a/install/js/a/i.js', line: 7 },
			{ file: '/repo/m/install/js/m/i.js', line: 3 },
			{ file: '/repo/z/install/js/z/i.js', line: 10 },
		]);
	});

	it('picks the earliest line per file in locations', () => {
		const usages: UsageLocation[] = [
			usage('js-import', '/repo/a/i.js', 12, { imports: ['UI'] }),
			usage('js-import', '/repo/a/i.js', 4, { imports: ['UI'] }),
			usage('js-import', '/repo/a/i.js', 8, { imports: ['UI'] }),
		];

		const summary = summarizeUsages(usages);
		const ui = summary.imports.find((it) => it.name === 'UI');

		assert.equal(ui?.files, 1);
		assert.deepEqual(ui?.locations, [{ file: '/repo/a/i.js', line: 4 }]);
	});
});

describe('filterUsages', () => {
	const usages: UsageLocation[] = [
		usage('js-import', '/a.js', 1, { imports: ['UI'] }),
		usage('js-import', '/b.js', 1, { imports: ['Manager', 'Balloon'] }),
		usage('js-import', '/c.js', 1, { imports: [] }),
		usage('js-load-extension', '/d.js'),
		usage('js-namespace', '/e.js', 1, { namespace: 'BX.UI.Notification.Center' }),
		usage('js-namespace', '/f.js', 1, { namespace: 'BX.UI.Notification.Balloon' }),
		usage('js-inheritance', '/g.js', 1, { inheritedFrom: 'BX.UI.Notification.Balloon' }),
		usage('php-extension-load', '/h.php'),
	];

	it('filters by named import', () => {
		const filtered = filterUsages(usages, { imports: 'UI' });
		assert.equal(filtered.length, 1);
		assert.equal(filtered[0].file, '/a.js');
	});

	it('filters by side-effect import sentinel', () => {
		const filtered = filterUsages(usages, { imports: '(side-effect)' });
		assert.equal(filtered.length, 1);
		assert.equal(filtered[0].file, '/c.js');
	});

	it('filters by namespace prefix (matches children)', () => {
		const filtered = filterUsages(usages, { namespace: 'BX.UI.Notification' });
		assert.equal(filtered.length, 3); // 2 namespace + 1 inheritance
	});

	it('filters by namespace exact match', () => {
		const filtered = filterUsages(usages, { namespace: 'BX.UI.Notification.Balloon' });
		assert.equal(filtered.length, 2); // 1 namespace + 1 inheritance
		assert.ok(filtered.every((u) => /Balloon/.test(u.details?.namespace ?? u.details?.inheritedFrom ?? '')));
	});

	it('filters by kinds', () => {
		const filtered = filterUsages(usages, { kinds: ['js-load-extension', 'php-extension-load'] });
		assert.equal(filtered.length, 2);
	});

	it('combines filters with AND semantics', () => {
		const filtered = filterUsages(usages, {
			kinds: ['js-import'],
			imports: 'Manager',
		});
		assert.equal(filtered.length, 1);
		assert.equal(filtered[0].file, '/b.js');
	});

	it('returns input unchanged with no filters', () => {
		const filtered = filterUsages(usages, {});
		assert.equal(filtered.length, usages.length);
	});
});
