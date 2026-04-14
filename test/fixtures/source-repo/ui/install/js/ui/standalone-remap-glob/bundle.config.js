module.exports = {
	input: './src/index.js',
	output: {
		js: './dist/bundle.js',
	},
	namespace: 'BX.UI.StandaloneRemapGlob',
	standalone: {
		remap: {
			'ui.type-only-dep.*': 'ui.*',
		},
	},
};
