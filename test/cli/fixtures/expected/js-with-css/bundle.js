/* eslint-disable */
(function (exports) {
	'use strict';

	class Panel {
	  #element;
	  constructor(container) {
	    this.#element = document.createElement('div');
	    this.#element.className = 'js-panel';
	    container.appendChild(this.#element);
	  }
	  setContent(html) {
	    this.#element.innerHTML = html;
	  }
	}

	exports.Panel = Panel;

})(this.window = this.window || {});
//# sourceMappingURL=bundle.js.map
