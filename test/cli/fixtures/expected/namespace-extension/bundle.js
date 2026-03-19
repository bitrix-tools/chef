/* eslint-disable */
this.BX = this.BX || {};
this.BX.Test = this.BX.Test || {};
(function (exports) {
	'use strict';

	class NamespaceComponent {
	  greet() {
	    return 'hello';
	  }
	}
	function createComponent() {
	  return new NamespaceComponent();
	}

	exports.NamespaceComponent = NamespaceComponent;
	exports.createComponent = createComponent;

})(this.BX.Test.Namespace = this.BX.Test.Namespace || {});
//# sourceMappingURL=bundle.js.map
