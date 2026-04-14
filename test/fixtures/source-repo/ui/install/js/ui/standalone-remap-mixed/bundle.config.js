module.exports = {
	input: './src/index.js',
	output: {
		js: './dist/bundle.js',
	},
	namespace: 'BX.UI.StandaloneRemapMixed',
	standalone: {
		remap: {
			'ui.type-only-dep': 'ui.forms',
			'ui.npm-wrapper-types.*': { npm: '@test/*', from: 'ui.npm-wrapper-types' },
		},
	},
};
