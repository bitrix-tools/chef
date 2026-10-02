module.exports = {
	input: './src/index.js',
	output: {
		js: './dist/inline-basic.bundle.js',
	},
	namespace: 'BX.UI.InlineBasic',
	inline: ['ui.inline-lib'],
};
