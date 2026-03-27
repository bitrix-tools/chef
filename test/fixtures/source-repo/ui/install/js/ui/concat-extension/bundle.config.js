module.exports = {
	input: './src/extension.js',
	output: {
		js: './dist/extension.bundle.js',
		css: './dist/extension.bundle.css',
	},
	concat: {
		js: [
			'./src/legacy/first.js',
			'./dist/extension.bundle.js',
			'./src/legacy/last.js',
		],
		css: [
			'./src/legacy/reset.css',
			'./dist/extension.bundle.css',
		],
	},
};
