import { describe, it } from 'mocha';
import { assert } from 'chai';

import { convertIndent } from '../../src/modules/engines/build/rollup/plugins/tab-indent';

describe('convertIndent', () => {

	it('should convert 2 spaces to 1 tab', () => {
		assert.equal(convertIndent('  x'), '\tx');
	});

	it('should convert 4 spaces to 2 tabs', () => {
		assert.equal(convertIndent('    x'), '\t\tx');
	});

	it('should convert 6 spaces to 3 tabs', () => {
		assert.equal(convertIndent('      x'), '\t\t\tx');
	});

	it('should preserve existing leading tabs', () => {
		assert.equal(convertIndent('\tx'), '\tx');
		assert.equal(convertIndent('\t\tx'), '\t\tx');
	});

	it('should convert spaces after existing tabs', () => {
		assert.equal(convertIndent('\t  x'), '\t\tx');
		assert.equal(convertIndent('\t    x'), '\t\t\tx');
	});

	it('should not modify lines without leading spaces', () => {
		assert.equal(convertIndent('hello'), 'hello');
		assert.equal(convertIndent('var x = 1;'), 'var x = 1;');
	});

	it('should not modify empty lines', () => {
		assert.equal(convertIndent(''), '');
		assert.equal(convertIndent('\n\n'), '\n\n');
	});

	it('should not modify single space (odd count)', () => {
		assert.equal(convertIndent(' x'), ' x');
	});

	it('should convert even part and leave trailing odd space', () => {
		assert.equal(convertIndent('   x'), '\t x');
		assert.equal(convertIndent('     x'), '\t\t x');
	});

	it('should not modify spaces inside the line', () => {
		assert.equal(convertIndent('var x = 1;'), 'var x = 1;');
		assert.equal(convertIndent('\tvar x  =  1;'), '\tvar x  =  1;');
	});

	it('should preserve string literals with spaces', () => {
		const input = '  var s = "  hello  ";';
		assert.equal(convertIndent(input), '\tvar s = "  hello  ";');
	});

	it('should handle multiline code', () => {
		const input = [
			'(function () {',
			'  var x = 1;',
			'  if (x) {',
			'    return x;',
			'  }',
			'})();',
		].join('\n');

		const expected = [
			'(function () {',
			'\tvar x = 1;',
			'\tif (x) {',
			'\t\treturn x;',
			'\t}',
			'})();',
		].join('\n');

		assert.equal(convertIndent(input), expected);
	});

	it('should handle Rollup IIFE wrapper with tab + babel 2-space indent', () => {
		const input = [
			'/* eslint-disable */',
			'(function (exports) {',
			'\t\'use strict\';',
			'',
			'\tvar Foo = function () {',
			'\t  function Foo() {',
			'\t    this.x = 1;',
			'\t  }',
			'\t  return Foo;',
			'\t}();',
			'',
			'\texports.Foo = Foo;',
			'',
			'})(this.BX.Test = this.BX.Test || {});',
		].join('\n');

		const expected = [
			'/* eslint-disable */',
			'(function (exports) {',
			'\t\'use strict\';',
			'',
			'\tvar Foo = function () {',
			'\t\tfunction Foo() {',
			'\t\t\tthis.x = 1;',
			'\t\t}',
			'\t\treturn Foo;',
			'\t}();',
			'',
			'\texports.Foo = Foo;',
			'',
			'})(this.BX.Test = this.BX.Test || {});',
		].join('\n');

		assert.equal(convertIndent(input), expected);
	});

	it('should handle deeply nested code', () => {
		const input = [
			'  if (a) {',
			'    if (b) {',
			'      if (c) {',
			'        if (d) {',
			'          return true;',
			'        }',
			'      }',
			'    }',
			'  }',
		].join('\n');

		const expected = [
			'\tif (a) {',
			'\t\tif (b) {',
			'\t\t\tif (c) {',
			'\t\t\t\tif (d) {',
			'\t\t\t\t\treturn true;',
			'\t\t\t\t}',
			'\t\t\t}',
			'\t\t}',
			'\t}',
		].join('\n');

		assert.equal(convertIndent(input), expected);
	});

	it('should not change content, only indentation', () => {
		const input = [
			'  var arr = [1, 2, 3];',
			'  var obj = { a: 1, b: "  spaces  " };',
			'  console.log(arr.map(x => x * 2));',
			'  var re = /  pattern  /g;',
		].join('\n');

		const result = convertIndent(input);

		// Content after indentation should be identical
		const inputLines = input.split('\n').map((l) => l.trimStart());
		const resultLines = result.split('\n').map((l) => l.trimStart());
		assert.deepEqual(resultLines, inputLines);
	});

	it('should preserve template literals with indentation', () => {
		const input = '  var t = `\n    indented template\n  `;';
		const expected = '\tvar t = `\n\t\tindented template\n\t`;';
		assert.equal(convertIndent(input), expected);
	});

	it('should handle Windows-style line endings', () => {
		const input = '  x\r\n    y\r\n';
		const expected = '\tx\r\n\t\ty\r\n';
		assert.equal(convertIndent(input), expected);
	});

	it('should handle whitespace-only lines', () => {
		assert.equal(convertIndent('  '), '\t');
		assert.equal(convertIndent('    '), '\t\t');
		assert.equal(convertIndent('\t  '), '\t\t');
	});
});
