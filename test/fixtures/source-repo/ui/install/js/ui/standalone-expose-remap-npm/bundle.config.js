module.exports = {
	input: './src/index.js',
	output: {
		js: './dist/bundle.js',
	},
	namespace: 'BX.UI.StandaloneExposeRemapNpm',
	standalone: {
		exposeNamespaces: true,
		remap: {
			'ui.npm-wrapper-types': { npm: '@test/npm-package', from: 'ui.npm-wrapper-types' },
		},
	},
};
