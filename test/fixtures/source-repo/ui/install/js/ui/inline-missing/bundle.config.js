module.exports = {
	input: './src/index.js',
	output: {
		js: './dist/inline-missing.bundle.js',
	},
	namespace: 'BX.UI.InlineMissing',
	inline: ['ui.inline-absent'],
};
