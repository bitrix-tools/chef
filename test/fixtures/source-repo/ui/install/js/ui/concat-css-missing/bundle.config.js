module.exports = {
	input: './src/index.js',
	output: {
		js: './dist/bundle.js',
		css: './dist/bundle.css',
	},
	concat: {
		css: [
			'./src/nonexistent.css',
			'./dist/bundle.css',
		],
	},
};
