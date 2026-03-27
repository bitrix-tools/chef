/* eslint-disable */
// Legacy code - should be first in bundle
var LegacyFirst = {
	init: function() {
		console.log('Legacy First initialized');
	}
};

(function (exports) {
	'use strict';

	class ConcatComponent {
		constructor() {
			this.name = 'ConcatComponent';
		}
		getName() {
			return this.name;
		}
	}

	exports.ConcatComponent = ConcatComponent;

})(this.window = this.window || {});



// Legacy code - should be last in bundle
var LegacyLast = {
	cleanup: function() {
		console.log('Legacy Last cleanup');
	}
};
//# sourceMappingURL=extension.bundle.js.map