module.exports = {
	input: './src/index.js',
	output: {
		js: './dist/bundle.js',
	},
	namespace: 'BX.UI.StandaloneRemapNpmGlob',
	standalone: {
		remap: {
			'ui.npm-wrapper-types.*': { npm: '@test/*', from: 'ui.npm-wrapper-types' },
		},
	},
};
