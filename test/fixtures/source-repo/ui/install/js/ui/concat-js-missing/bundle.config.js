module.exports = {
	input: './src/index.js',
	output: {
		js: './dist/bundle.js',
	},
	concat: {
		js: [
			'./src/nonexistent.js',
			'./dist/bundle.js',
		],
	},
};
