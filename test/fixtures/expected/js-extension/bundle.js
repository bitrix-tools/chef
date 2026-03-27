/* eslint-disable */
(function (exports) {
	'use strict';

	function formatName(name) {
		return name.charAt(0).toUpperCase() + name.slice(1);
	}

	class Greeter {
		#prefix;
		constructor(prefix) {
			this.#prefix = prefix;
		}
		greet(name) {
			return `${this.#prefix} ${formatName(name)}`;
		}
	}

	exports.Greeter = Greeter;

})(this.window = this.window || {});
//# sourceMappingURL=bundle.js.map
