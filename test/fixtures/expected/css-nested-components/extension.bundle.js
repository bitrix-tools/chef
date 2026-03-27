/* eslint-disable */
(function (exports) {
	'use strict';

	class Header {
		render() {
			return '<div class="header">Header</div>';
		}
	}

	class Sidebar {
		render() {
			return '<div class="sidebar">Sidebar</div>';
		}
	}

	class Card {
		render() {
			return '<div class="card">Card</div>';
		}
	}

	class List {
		render() {
			return '<div class="list"><div class="list-item">Item</div></div>';
		}
	}

	class Content {
		constructor() {
			this.card = new Card();
			this.list = new List();
		}
		render() {
			return `<div class="content">${this.card.render()}${this.list.render()}</div>`;
		}
	}

	class App {
		constructor() {
			this.header = new Header();
			this.sidebar = new Sidebar();
			this.content = new Content();
		}
		render() {
			return `<div class="app">${this.header.render()}${this.sidebar.render()}${this.content.render()}</div>`;
		}
	}

	exports.App = App;

})(this.window = this.window || {});
//# sourceMappingURL=extension.bundle.js.map
