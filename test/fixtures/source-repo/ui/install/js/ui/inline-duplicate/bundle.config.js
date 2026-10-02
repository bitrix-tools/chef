module.exports = {
	input: './src/index.js',
	output: {
		js: './dist/inline-duplicate.bundle.js',
	},
	namespace: 'BX.UI.InlineDuplicate',
	inline: ['ui.buttons'],
};
