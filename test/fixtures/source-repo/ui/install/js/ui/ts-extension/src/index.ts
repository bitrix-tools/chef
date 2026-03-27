interface User {
	name: string;
	age: number;
}

/** Service for managing users */
export class UserService
{
	#users: User[] = [];

	/** Adds a user to the collection */
	add(user: User): void
	{
		this.#users.push(user);
	}

	findByName(name: string): User | undefined
	{
		return this.#users.find(u => u.name === name);
	}

	get count(): number
	{
		return this.#users.length;
	}
}
