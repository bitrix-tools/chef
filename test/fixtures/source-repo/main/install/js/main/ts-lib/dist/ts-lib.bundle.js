/* eslint-disable */
this.BX = this.BX || {};
this.BX.Main = this.BX.Main || {};
(function(exports) {
	'use strict';

	class TsLib
	{
		#config;

		constructor(config)
		{
			this.#config = config;
		}

		getName()
		{
			return this.#config.name;
		}

		getVersion()
		{
			return this.#config.version;
		}
	}

	exports.TsLib = TsLib;

})(this.BX.Main.TsLib = this.BX.Main.TsLib || {});
