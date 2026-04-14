module.exports = {
	input: './src/index.js',
	output: {
		js: './dist/bundle.js',
	},
	namespace: 'BX.UI.StandaloneExpose',
	standalone: {
		exposeNamespaces: true,
	},
};
