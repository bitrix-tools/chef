import { describe, it } from 'mocha';
import { assert } from 'chai';

import { BuildStrategy } from '../../../src/modules/engines/build/build-strategy';

describe('BuildStrategy', () => {
	describe('sortDependencies', () => {
		it('should sort dependencies alphabetically by segments', () => {
			const deps = ['ui.buttons', 'main.core', 'main.popup', 'crm.entity'];
			const sorted = BuildStrategy.sortDependencies(deps);

			assert.deepEqual(sorted, ['crm.entity', 'main.core', 'main.popup', 'ui.buttons']);
		});

		it('should deduplicate dependencies', () => {
			const deps = ['main.core', 'ui.buttons', 'main.core', 'ui.buttons'];
			const sorted = BuildStrategy.sortDependencies(deps);

			assert.deepEqual(sorted, ['main.core', 'ui.buttons']);
		});

		it('should handle empty array', () => {
			const sorted = BuildStrategy.sortDependencies([]);
			assert.deepEqual(sorted, []);
		});

		it('should sort shorter names before longer with same prefix', () => {
			const deps = ['main.core.ext', 'main.core', 'main'];
			const sorted = BuildStrategy.sortDependencies(deps);

			assert.deepEqual(sorted, ['main', 'main.core', 'main.core.ext']);
		});

		it('should handle single element', () => {
			const sorted = BuildStrategy.sortDependencies(['main.core']);
			assert.deepEqual(sorted, ['main.core']);
		});

		it('should sort using locale comparison', () => {
			const deps = ['ui.Vue', 'ui.buttons', 'ui.Alert'];
			const sorted = BuildStrategy.sortDependencies(deps);

			// localeCompare puts lowercase before uppercase
			assert.deepEqual(sorted, ['ui.Alert', 'ui.buttons', 'ui.Vue']);
		});
	});
});
