/* eslint-disable */
(function (exports) {
	'use strict';

	class FlowComponent {
		#options;
		constructor(options) {
			this.#options = options;
		}
		getName() {
			return this.#options.name;
		}
		getValue() {
			return this.#options.value;
		}
	}

	exports.FlowComponent = FlowComponent;

})(this.window = this.window || {});
//# sourceMappingURL=bundle.js.map
