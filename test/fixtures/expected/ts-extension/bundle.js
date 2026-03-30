/* eslint-disable */
this.BX = this.BX || {};
this.BX.Test = this.BX.Test || {};
(function (exports) {
	'use strict';

	class BaseEvent {
		#type;
		constructor(type) {
			this.#type = type;
		}
		getType() {
			return this.#type;
		}
	}

	class EventEmitter {
		#listeners = new Map();
		subscribe(eventName, listener) {
			if (!this.#listeners.has(eventName)) {
				this.#listeners.set(eventName, new Set());
			}
			this.#listeners.get(eventName).add(listener);
		}
		emit(eventName, event) {
			const listeners = this.#listeners.get(eventName);
			if (listeners) {
				for (const listener of listeners) {
					listener(event);
				}
			}
		}
	}

	function formatName(first, last) {
		return `${first} ${last}`;
	}

	class UserService {
		#users = [];
		#emitter = new EventEmitter();
		add(user) {
			this.#users.push(user);
			this.#emitter.emit('add', new BaseEvent('add'));
		}
		findByName(name) {
			return this.#users.find(u => u.name === name);
		}
		getDisplayName(user) {
			return formatName(user.name, '');
		}
		get count() {
			return this.#users.length;
		}
	}

	exports.BaseEvent = BaseEvent;
	exports.EventEmitter = EventEmitter;
	exports.UserService = UserService;

})(this.BX.Test.Users = this.BX.Test.Users || {});
//# sourceMappingURL=bundle.js.map
