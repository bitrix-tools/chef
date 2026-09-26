module.exports = {
	input: './src/index.js',
	output: {
		js: './dist/bundle.js',
		css: './dist/bundle.css',
	},
	cssImages: {
		maxSize: 1,
		exclude: ['./src/images/photos/**'],
	},
};
