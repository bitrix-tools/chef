import { describe, it } from 'mocha';
import { assert } from 'chai';

// extractExtensionPrefix is not exported, so we test it indirectly
// through the standalone CSS images test in standalone.test.ts.
// Here we test the logic pattern directly.

function extractExtensionPrefix(filePath: string): string | null
{
	const normalized = filePath.replaceAll('\\', '/');

	const jsIndex = normalized.lastIndexOf('/js/');
	if (jsIndex === -1)
	{
		return null;
	}

	const afterJs = normalized.slice(jsIndex + 4);

	const srcIndex = afterJs.indexOf('/src/');
	const distIndex = afterJs.indexOf('/dist/');
	const cutIndex = srcIndex !== -1 && (distIndex === -1 || srcIndex < distIndex)
		? srcIndex
		: distIndex;

	if (cutIndex === -1)
	{
		return null;
	}

	return afterJs.slice(0, cutIndex).replaceAll('/', '.');
}

describe('extractExtensionPrefix', () => {
	it('should extract prefix from source repo path', () => {
		const result = extractExtensionPrefix('/modules/ui/install/js/ui/icon-set/outline/src/images/copy.svg');
		assert.equal(result, 'ui.icon-set.outline');
	});

	it('should extract prefix from dist path', () => {
		const result = extractExtensionPrefix('/modules/ui/install/js/ui/design-tokens/air/dist/air-design-tokens.css');
		assert.equal(result, 'ui.design-tokens.air');
	});

	it('should prefer src over dist when src comes first', () => {
		const result = extractExtensionPrefix('/modules/main/install/js/main/popup/src/css/popup.css');
		assert.equal(result, 'main.popup');
	});

	it('should handle project repo local path', () => {
		const result = extractExtensionPrefix('/project/local/js/vendor/widget/src/style.css');
		assert.equal(result, 'vendor.widget');
	});

	it('should handle Windows paths', () => {
		const result = extractExtensionPrefix('C:\\modules\\ui\\install\\js\\ui\\forms\\src\\style.css');
		assert.equal(result, 'ui.forms');
	});

	it('should return null when no /js/ segment', () => {
		const result = extractExtensionPrefix('/some/random/path/style.css');
		assert.isNull(result);
	});

	it('should return null when no src or dist segment', () => {
		const result = extractExtensionPrefix('/modules/ui/install/js/ui/forms/style.css');
		assert.isNull(result);
	});

	it('should handle deeply nested source files', () => {
		const result = extractExtensionPrefix('/modules/ui/install/js/ui/text-editor/src/plugins/video/video.css');
		assert.equal(result, 'ui.text-editor');
	});
});
