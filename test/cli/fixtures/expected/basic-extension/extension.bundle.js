/* eslint-disable */
(function (exports, main_core) {
	'use strict';

	class BasicComponent {
	  constructor(message) {
	    this.message = message;
	  }
	  render() {
	    return main_core.Tag.render`<div class="basic-component">${this.message}</div>`;
	  }
	}

	exports.BasicComponent = BasicComponent;

})(this.window = this.window || {}, window);
//# sourceMappingURL=extension.bundle.js.map
