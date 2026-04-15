module.exports = {
	input: './src/index.js',
	output: {
		js: './dist/bundle.js',
		css: './dist/bundle.css',
	},
	namespace: 'BX.UI.CssImagesDep',
	cssImages: {
		type: 'copy',
	},
};
