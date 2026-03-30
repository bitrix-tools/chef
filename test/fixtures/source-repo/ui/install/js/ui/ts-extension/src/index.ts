import BaseEvent from './base-event';
import EventEmitter from './event-emitter';
import { formatName } from './format-name';

/** Represents a user in the system */
export interface User {
	name: string;
	age: number;
}

/** Result of a user search operation */
export interface SearchResult {
	user: User | null;
	found: boolean;
}

/** Service for managing users */
export class UserService
{
	#users: User[] = [];
	#emitter = new EventEmitter();

	/** Adds a user to the collection */
	add(user: User): void
	{
		this.#users.push(user);
		this.#emitter.emit('add', new BaseEvent('add'));
	}

	findByName(name: string): SearchResult
	{
		const user = this.#users.find(u => u.name === name) ?? null;

		return { user, found: user !== null };
	}

	getDisplayName(user: User): string
	{
		return formatName(user.name, '');
	}

	get count(): number
	{
		return this.#users.length;
	}
}

export {
	BaseEvent,
	EventEmitter,
};

export type * from './types/common';
