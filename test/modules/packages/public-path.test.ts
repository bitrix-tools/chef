import { it, describe } from 'mocha';
import { assert } from 'chai';
import * as path from 'node:path';

describe('modules/packages/public-path-logic', () => {

	function extractPublicPathSegments(
		fullPath: string,
		root: string,
	): string | null
	{
		const relativePath = path.relative(root, fullPath);
		const segments = relativePath.split(path.sep);

		const markers = ['js', 'components', 'templates', 'activities'] as const;

		// Проверяем компонент внутри шаблона
		const templatesIndex = segments.indexOf('templates');
		const componentsAfterTemplates = templatesIndex !== -1
			? segments.indexOf('components', templatesIndex)
			: -1;

		if (componentsAfterTemplates !== -1)
		{
			return segments.slice(templatesIndex).join('/');
		}

		// Ищем первый маркер
		for (const marker of markers)
		{
			const markerIndex = segments.indexOf(marker);
			if (markerIndex !== -1)
			{
				return segments.slice(markerIndex).join('/');
			}
		}

		return null;
	}

	describe('extractPublicPathSegments', () => {
		describe('Extensions (js)', () => {
			it('Should extract js path from source module', () => {
				const result = extractPublicPathSegments(
					'/home/bitrix/modules/ui/install/js/ui/buttons',
					'/home/bitrix/modules',
				);
				assert.equal(result, 'js/ui/buttons');
			});

			it('Should extract js path from local', () => {
				const result = extractPublicPathSegments(
					'/home/bitrix/www/local/js/ui/buttons',
					'/home/bitrix/www',
				);
				assert.equal(result, 'js/ui/buttons');
			});

			it('Should extract js path from bitrix', () => {
				const result = extractPublicPathSegments(
					'/home/bitrix/www/bitrix/js/main/core',
					'/home/bitrix/www',
				);
				assert.equal(result, 'js/main/core');
			});
		});

		describe('Components', () => {
			it('Should extract components path from source module', () => {
				const result = extractPublicPathSegments(
					'/home/bitrix/modules/ui/install/components/bitrix/ui.button.panel',
					'/home/bitrix/modules',
				);
				assert.equal(result, 'components/bitrix/ui.button.panel');
			});

			it('Should extract components path from local', () => {
				const result = extractPublicPathSegments(
					'/home/bitrix/www/local/components/myvendor/my.component',
					'/home/bitrix/www',
				);
				assert.equal(result, 'components/myvendor/my.component');
			});
		});

		describe('Templates', () => {
			it('Should extract templates path from source module', () => {
				const result = extractPublicPathSegments(
					'/home/bitrix/modules/main/install/templates/main',
					'/home/bitrix/modules',
				);
				assert.equal(result, 'templates/main');
			});

			it('Should extract templates path from local', () => {
				const result = extractPublicPathSegments(
					'/home/bitrix/www/local/templates/mytemplate',
					'/home/bitrix/www',
				);
				assert.equal(result, 'templates/mytemplate');
			});
		});

		describe('Activities', () => {
			it('Should extract activities path from source module', () => {
				const result = extractPublicPathSegments(
					'/home/bitrix/modules/bizproc/install/activities/bitrix/myactivity',
					'/home/bitrix/modules',
				);
				assert.equal(result, 'activities/bitrix/myactivity');
			});

			it('Should extract activities path from local', () => {
				const result = extractPublicPathSegments(
					'/home/bitrix/www/local/activities/custom/myactivity',
					'/home/bitrix/www',
				);
				assert.equal(result, 'activities/custom/myactivity');
			});
		});

		describe('Components inside templates', () => {
			it('Should extract full path for component inside template', () => {
				const result = extractPublicPathSegments(
					'/home/bitrix/www/local/templates/main/components/bitrix/menu/horizontal',
					'/home/bitrix/www',
				);
				assert.equal(result, 'templates/main/components/bitrix/menu/horizontal');
			});

			it('Should extract full path for component inside template from source', () => {
				const result = extractPublicPathSegments(
					'/home/bitrix/modules/main/install/templates/main/components/bitrix/system.auth.form/.default',
					'/home/bitrix/modules',
				);
				assert.equal(result, 'templates/main/components/bitrix/system.auth.form/.default');
			});
		});

		describe('Unknown paths', () => {
			it('Should return null for unknown path structure', () => {
				const result = extractPublicPathSegments(
					'/home/bitrix/www/some/random/path',
					'/home/bitrix/www',
				);
				assert.isNull(result);
			});

			it('Should return null for dev folder', () => {
				const result = extractPublicPathSegments(
					'/home/bitrix/modules/ui/dev/test',
					'/home/bitrix/modules',
				);
				assert.isNull(result);
			});
		});
	});
});