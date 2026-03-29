import BaseEvent from './base-event';
import EventEmitter from './event-emitter';
import { formatName } from './format-name';

interface User {
	name: string;
	age: number;
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

	findByName(name: string): User | undefined
	{
		return this.#users.find(u => u.name === name);
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
