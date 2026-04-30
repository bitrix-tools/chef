module.exports = {
	input: './src/index.js',
	output: {
		js: './dist/bundle.js',
	},
	namespace: 'BX.UI.StandaloneExposeRemapNpmGlob',
	standalone: {
		exposeNamespaces: true,
		remap: {
			'ui.npm-wrapper-types.*': { npm: '@test/*', from: 'ui.npm-wrapper-types' },
		},
	},
};
