import { describe, it } from 'mocha';
import { assert } from 'chai';

import { toRuleId } from '../../../../src/modules/engines/lint/oxlint/run-oxlint';
import { toPresetRuleId } from '../../../../src/modules/engines/lint/oxlint/oxlint-config';

describe('rule ids', () => {
	it('turns oxlint codes into rule ids', () => {
		assert.equal(toRuleId('eslint(no-undef)'), 'no-undef');
		assert.equal(toRuleId('unicorn(prefer-includes)'), 'unicorn/prefer-includes');
		assert.equal(toRuleId('@stylistic(indent)'), '@stylistic/indent');
		assert.equal(toRuleId('@bitrix24/bitrix24-rules(no-bx)'), '@bitrix24/bitrix24-rules/no-bx');
		assert.isNull(toRuleId(undefined));
	});

	it('translates ESLint rule ids to the preset ones', () => {
		const preset = new Set(['eqeqeq', '@stylistic/max-len', '@bitrix24/core/camelcase', '@bitrix24/unicorn/no-for-loop', 'unicorn/prefer-includes', 'complexity']);

		assert.equal(toPresetRuleId('eqeqeq', preset), 'eqeqeq');
		assert.equal(toPresetRuleId('max-len', preset), '@stylistic/max-len');
		assert.equal(toPresetRuleId('camelcase', preset), '@bitrix24/core/camelcase');
		assert.equal(toPresetRuleId('unicorn/no-for-loop', preset), '@bitrix24/unicorn/no-for-loop');
		assert.equal(toPresetRuleId('unicorn/prefer-includes', preset), 'unicorn/prefer-includes');
		assert.equal(toPresetRuleId('sonarjs/cognitive-complexity', preset), 'complexity');
		assert.isNull(toPresetRuleId('no-restricted-syntax', preset));
	});
});
