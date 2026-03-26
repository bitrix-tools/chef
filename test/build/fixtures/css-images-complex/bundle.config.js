module.exports = {
	input: './src/index.js',
	output: {
		js: './dist/extension.bundle.js',
		css: './dist/extension.bundle.css',
	},
	cssImages: {
		type: 'inline',
		maxSize: 1,
	},
};
