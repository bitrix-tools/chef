import { describe, it } from 'mocha';
import { assert } from 'chai';

import { PhpConfigParser } from '../../../src/modules/config/php/parser/php-config-parser';

function parse(phpCode: string): Record<string, any>
{
	const parser = new PhpConfigParser();
	return parser.parse(phpCode);
}

describe('PhpConfigParser', () => {

	describe('basic config', () => {
		it('should parse simple config with js, css, rel', () => {
			const result = parse(`<?php
				return [
					'js' => 'dist/app.bundle.js',
					'css' => 'dist/app.bundle.css',
					'rel' => [
						'main.core',
						'ui.buttons',
					],
					'skip_core' => false,
				];
			`);

			assert.equal(result.js, 'dist/app.bundle.js');
			assert.equal(result.css, 'dist/app.bundle.css');
			assert.deepEqual(result.rel, ['main.core', 'ui.buttons']);
			assert.equal(result.skip_core, false);
		});

		it('should parse config with short php tag', () => {
			const result = parse(`<?
				return [
					'js' => 'script.js',
					'rel' => [],
				];
			`);

			assert.equal(result.js, 'script.js');
			assert.deepEqual(result.rel, []);
		});

		it('should parse config with array values for js and css', () => {
			const result = parse(`<?php
				return [
					'js' => [
						'./dist/app.bundle.js',
					],
					'css' => [
						'./dist/app.bundle.css',
					],
					'rel' => [],
				];
			`);

			assert.deepEqual(result.js, ['./dist/app.bundle.js']);
			assert.deepEqual(result.css, ['./dist/app.bundle.css']);
		});
	});

	describe('config with guard clause', () => {
		it('should parse config with B_PROLOG_INCLUDED guard', () => {
			const result = parse(`<?
				if (!defined('B_PROLOG_INCLUDED') || B_PROLOG_INCLUDED !== true)
				{
					die();
				}

				return [
					'css' => 'dist/parser.bundle.css',
					'js' => 'dist/parser.bundle.js',
					'rel' => [
						'ui.bbcode.ast-processor',
						'main.core',
					],
					'skip_core' => false,
				];
			`);

			assert.equal(result.css, 'dist/parser.bundle.css');
			assert.equal(result.js, 'dist/parser.bundle.js');
			assert.deepEqual(result.rel, ['ui.bbcode.ast-processor', 'main.core']);
			assert.equal(result.skip_core, false);
		});
	});

	describe('scalar values', () => {
		it('should parse string values', () => {
			const result = parse(`<?php return ['key' => 'value'];`);
			assert.equal(result.key, 'value');
		});

		it('should parse integer values', () => {
			const result = parse(`<?php return ['count' => 42];`);
			assert.equal(result.count, 42);
		});

		it('should parse float values', () => {
			const result = parse(`<?php return ['ratio' => 1.5];`);
			assert.equal(result.ratio, 1.5);
		});

		it('should parse boolean true', () => {
			const result = parse(`<?php return ['enabled' => true];`);
			assert.equal(result.enabled, true);
		});

		it('should parse boolean false', () => {
			const result = parse(`<?php return ['enabled' => false];`);
			assert.equal(result.enabled, false);
		});

		it('should parse null', () => {
			const result = parse(`<?php return ['value' => null];`);
			assert.equal(result.value, null);
		});
	});

	describe('arrays', () => {
		it('should parse indexed array', () => {
			const result = parse(`<?php return ['items' => ['a', 'b', 'c']];`);
			assert.deepEqual(result.items, ['a', 'b', 'c']);
		});

		it('should parse associative array', () => {
			const result = parse(`<?php
				return [
					'settings' => [
						'key1' => 'value1',
						'key2' => 'value2',
					],
				];
			`);

			assert.deepEqual(result.settings, { key1: 'value1', key2: 'value2' });
		});

		it('should parse nested arrays', () => {
			const result = parse(`<?php
				return [
					'settings' => [
						'nested' => [
							'deep' => 'value',
						],
					],
				];
			`);

			assert.equal(result.settings.nested.deep, 'value');
		});

		it('should parse empty array', () => {
			const result = parse(`<?php return ['rel' => []];`);
			assert.deepEqual(result.rel, []);
		});
	});

	describe('unsupported expressions', () => {
		it('should skip PHP variable and return undefined', () => {
			const result = parse(`<?php return ['path' => $someVar];`);
			assert.equal(result.path, undefined);
		});

		it('should skip concatenation with constant', () => {
			const result = parse(`<?php
				return [
					'lang' => BX_ROOT.'/modules/main/js_core.php',
				];
			`);

			// BX_ROOT is unknown, concatenation is skipped — partial string returned
			assert.ok('lang' in result);
		});

		it('should skip static method call', () => {
			const result = parse(`<?php
				return [
					'value' => ClassName::method(),
				];
			`);

			assert.equal(result.value, undefined);
		});

		it('should skip static property access', () => {
			const result = parse(`<?php
				return [
					'value' => ClassName::PROP,
				];
			`);

			assert.equal(result.value, undefined);
		});

		it('should skip function call', () => {
			const result = parse(`<?php
				return [
					'value' => myFunction('arg1', 'arg2'),
				];
			`);

			assert.equal(result.value, undefined);
		});

		it('should parse simple values after skipping complex expressions', () => {
			const result = parse(`<?php
				return [
					'oninit' => function() { return []; },
					'js' => 'script.js',
					'rel' => ['main.core'],
				];
			`);

			assert.equal(result.js, 'script.js');
			assert.deepEqual(result.rel, ['main.core']);
		});
	});

	describe('includes key', () => {
		it('should parse includes array', () => {
			const result = parse(`<?php
				return [
					'js' => 'core.js',
					'rel' => [],
					'includes' => [
						'ajax',
						'promise',
						'main.polyfill.core',
					],
				];
			`);

			assert.deepEqual(result.includes, ['ajax', 'promise', 'main.polyfill.core']);
		});
	});

	describe('edge cases', () => {
		it('should return empty object when no return statement', () => {
			const result = parse(`<?php $x = 1;`);
			assert.deepEqual(result, {});
		});

		it('should return empty object for empty input', () => {
			const result = parse('');
			assert.deepEqual(result, {});
		});

		it('should parse skip_core as true', () => {
			const result = parse(`<?php return ['skip_core' => true];`);
			assert.equal(result.skip_core, true);
		});

		it('should handle config with many dependencies', () => {
			const result = parse(`<?php
				return [
					'rel' => [
						'im.lib.utils',
						'call.core',
						'ui.dialogs.messagebox',
						'ui.buttons',
						'main.core',
						'main.popup',
						'main.core.events',
						'ui.switcher',
						'loader',
					],
					'skip_core' => false,
				];
			`);

			assert.equal(result.rel.length, 9);
			assert.include(result.rel, 'main.core');
			assert.include(result.rel, 'ui.buttons');
		});
	});

	describe('oninit with closure', () => {
		it('should skip closure and parse remaining keys', () => {
			const result = parse(`<?php
				return [
					'js' => 'script.js',
					'rel' => ['main.core'],
					'oninit' => function() {
						return ['settings' => ['key' => 'value']];
					},
					'skip_core' => false,
				];
			`);

			assert.equal(result.oninit, undefined);
			assert.equal(result.js, 'script.js');
			assert.deepEqual(result.rel, ['main.core']);
			assert.equal(result.skip_core, false);
		});
	});

	describe('settings key', () => {
		it('should parse settings as nested associative array', () => {
			const result = parse(`<?php
				return [
					'rel' => ['main.core'],
					'settings' => [
						'option1' => true,
						'option2' => 'value',
						'nested' => [
							'deep' => 42,
						],
					],
				];
			`);

			assert.equal(result.settings.option1, true);
			assert.equal(result.settings.option2, 'value');
			assert.equal(result.settings.nested.deep, 42);
		});
	});

	describe('early return guard', () => {
		it('should skip early return [] and parse the main config', () => {
			const result = parse(`<?php
				if (!defined("B_PROLOG_INCLUDED") || B_PROLOG_INCLUDED !== true)
				{
					die();
				}

				if (!\\Bitrix\\Main\\Loader::includeModule('im'))
				{
					return [];
				}

				return [
					'js' => './dist/core.bundle.js',
					'rel' => [
						'main.core',
						'ui.vue3',
					],
					'skip_core' => false,
				];
			`);

			assert.deepEqual(result.rel, ['main.core', 'ui.vue3']);
			assert.equal(result.js, './dist/core.bundle.js');
			assert.equal(result.skip_core, false);
		});

		it('should handle early return with non-empty array', () => {
			const result = parse(`<?php
				if ($condition)
				{
					return ['error' => true];
				}

				return [
					'rel' => ['main.core'],
					'js' => 'bundle.js',
				];
			`);

			assert.deepEqual(result.rel, ['main.core']);
			assert.equal(result.js, 'bundle.js');
		});

		it('should use last top-level return if multiple exist', () => {
			const result = parse(`<?php
				if (false)
				{
					return ['rel' => ['wrong']];
				}

				return [
					'rel' => ['correct'],
				];
			`);

			assert.deepEqual(result.rel, ['correct']);
		});

		it('should not treat return inside closure as top-level', () => {
			const result = parse(`<?php
				return [
					'js' => 'script.js',
					'oninit' => function() {
						return ['settings' => ['key' => 'value']];
					},
					'rel' => ['main.core'],
				];
			`);

			assert.equal(result.js, 'script.js');
			assert.deepEqual(result.rel, ['main.core']);
		});
	});
});
