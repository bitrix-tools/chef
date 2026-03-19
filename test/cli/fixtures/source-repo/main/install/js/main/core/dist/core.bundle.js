(function (exports) {
	'use strict';
	class Core {
		constructor() { this.ready = true; }
		isReady() { return this.ready; }
	}
	exports.Core = Core;
})(this.BX = this.BX || {});
