import { describe, it } from 'mocha';
import { assert } from 'chai';

import { flowImportsVisitor } from '../../../../../src/modules/engines/migration/flow-to-ts/visitors/flow-imports';
import { applyVisitor } from '../test-utils';

describe('flowImportsVisitor', () => {
	it('should convert import typeof to import type', () => {
		const result = applyVisitor('import typeof Type from "main.core";', flowImportsVisitor);

		assert.include(result, 'import type');
		assert.notInclude(result, 'typeof');
	});

	it('should convert named import typeof to import type', () => {
		const result = applyVisitor('import { typeof Type } from "main.core";', flowImportsVisitor);

		assert.include(result, 'type Type');
		assert.notInclude(result, 'typeof');
	});
});
