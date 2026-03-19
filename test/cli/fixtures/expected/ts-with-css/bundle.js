/* eslint-disable */
(function (exports) {
	'use strict';

	class Widget {
	    #element;
	    constructor(container) {
	        this.#element = document.createElement('div');
	        this.#element.className = 'ts-widget';
	        container.appendChild(this.#element);
	    }
	    setText(text) {
	        this.#element.textContent = text;
	    }
	}

	exports.Widget = Widget;

})(this.window = this.window || {});
//# sourceMappingURL=bundle.js.map
