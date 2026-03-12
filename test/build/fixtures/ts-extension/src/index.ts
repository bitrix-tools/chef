interface User {
	name: string;
	age: number;
}

export class UserService
{
	#users: User[] = [];

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
