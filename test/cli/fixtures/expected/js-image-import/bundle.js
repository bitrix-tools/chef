/* eslint-disable */
(function (exports) {
	'use strict';

	var iconUrl = "/bitrix/js/ui/js-image-import/dist/assets/icon.svg";

	class Icon {
	  render() {
	    const img = document.createElement('img');
	    img.src = iconUrl;
	    return img;
	  }
	}

	exports.Icon = Icon;

})(this.window = this.window || {});
//# sourceMappingURL=bundle.js.map
