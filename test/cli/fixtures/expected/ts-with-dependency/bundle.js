/* eslint-disable */
this.BX = this.BX || {};
this.BX.Test = this.BX.Test || {};
(function (exports, main_core) {
	'use strict';

	class TsComponent {
	    #message;
	    constructor(message) {
	        this.#message = message;
	    }
	    render() {
	        return main_core.Tag.render `<div>${this.#message}</div>`;
	    }
	}

	exports.TsComponent = TsComponent;

})(this.BX.Test.TsDep = this.BX.Test.TsDep || {}, window);
//# sourceMappingURL=bundle.js.map
