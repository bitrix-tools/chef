module.exports = {
	input: './src/extension.js',
	output: {
		js: './dist/extension.bundle.js',
		css: './dist/extension.bundle.css',
	},
	cssImages: {
		type: 'inline',
		maxSize: 14,
	},
};
