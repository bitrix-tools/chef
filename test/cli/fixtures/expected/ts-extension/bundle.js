/* eslint-disable */
this.BX = this.BX || {};
this.BX.Test = this.BX.Test || {};
(function (exports) {
	'use strict';

	
	class UserService {
	    #users = [];
	    
	    add(user) {
	        this.#users.push(user);
	    }
	    findByName(name) {
	        return this.#users.find(u => u.name === name);
	    }
	    get count() {
	        return this.#users.length;
	    }
	}

	exports.UserService = UserService;

})(this.BX.Test.Users = this.BX.Test.Users || {});
//# sourceMappingURL=bundle.js.map
