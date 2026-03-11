import { describe, it } from 'mocha';
import { assert } from 'chai';

import { flowCommentsVisitor } from '../../../../../src/modules/engines/migration/flow-to-ts/visitors/flow-comments';
import { applyVisitor } from '../test-utils';

describe('flowCommentsVisitor', () => {
	it('should remove @flow comments', () => {
		const result = applyVisitor('// @flow\nimport { Type } from "main.core";', flowCommentsVisitor);

		assert.notInclude(result, '@flow');
		assert.include(result, 'main.core');
	});

	it('should remove $FlowIssue comments', () => {
		const result = applyVisitor('// $FlowIssue\nconst x = 1;', flowCommentsVisitor);

		assert.notInclude(result, '$FlowIssue');
	});

	it('should convert $FlowFixMe to @ts-expect-error', () => {
		const result = applyVisitor('// $FlowFixMe\nconst x = 1;', flowCommentsVisitor);

		assert.include(result, '@ts-expect-error');
		assert.notInclude(result, '$FlowFixMe');
	});

	it('should convert $FlowExpectError to @ts-expect-error', () => {
		const result = applyVisitor('// $FlowExpectError\nconst x = 1;', flowCommentsVisitor);

		assert.include(result, '@ts-expect-error');
	});

	it('should convert $FlowIgnore to @ts-ignore', () => {
		const result = applyVisitor('// $FlowIgnore\nconst x = 1;', flowCommentsVisitor);

		assert.include(result, '@ts-ignore');
		assert.notInclude(result, '$FlowIgnore');
	});
});
