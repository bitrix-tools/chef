/* eslint-disable */
(function (exports) {
	'use strict';

	class TsWidget {
	    label;
	    constructor(label) {
	        this.label = label;
	    }
	    render() {
	        return `<div>${this.label}</div>`;
	    }
	}

	exports.TsWidget = TsWidget;

})(this.window = this.window || {});
//# sourceMappingURL=ts-ext.bundle.js.map
