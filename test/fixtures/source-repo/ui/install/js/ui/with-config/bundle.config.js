module.exports = {
	input: './src/index.js',
	output: {
		js: './dist/with-config.bundle.js',
	},
	namespace: 'BX.UI.WithConfig',
	concat: {
		js: true,
	},
};
