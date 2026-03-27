module.exports = {
	input: './src/index.js',
	output: {
		js: './dist/bundle.js',
		css: './dist/bundle.css',
	},
	cssImages: {
		type: 'inline',
		maxSize: 1,
	},
};
