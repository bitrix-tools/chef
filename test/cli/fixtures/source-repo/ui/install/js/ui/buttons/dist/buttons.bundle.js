(function (exports) {
	'use strict';
	class Button {
		constructor(text) { this.text = text; }
		render() { return `<button>${this.text}</button>`; }
	}
	exports.Button = Button;
})(this.BX = this.BX || {});
