/* eslint-disable */
this.BX = this.BX || {};
this.BX.Test = this.BX.Test || {};
(function (exports) {
	'use strict';

	var NamespaceComponent = /*#__PURE__*/function () {
		function NamespaceComponent() {
			babelHelpers.classCallCheck(this, NamespaceComponent);
		}
		return babelHelpers.createClass(NamespaceComponent, [{
			key: "greet",
			value: function greet() {
				return 'hello';
			}
		}]);
	}();
	function createComponent() {
		return new NamespaceComponent();
	}

	exports.NamespaceComponent = NamespaceComponent;
	exports.createComponent = createComponent;

})(this.BX.Test.Namespace = this.BX.Test.Namespace || {});
//# sourceMappingURL=bundle.js.map
