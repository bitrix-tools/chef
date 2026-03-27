module.exports = {
	input: './src/app.js',
	output: './app.js',
	concat: {
		js: [
			'./app.js',
			'./src/old/app.js',
		],
	},
};
