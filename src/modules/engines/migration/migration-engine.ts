import type { MigrationStrategy } from './migration-strategy';
import type { MigrationOptions, MigrationResult } from './migration-types';

export class MigrationEngine
{
	protected readonly strategy: MigrationStrategy;

	constructor(strategy: MigrationStrategy)
	{
		this.strategy = strategy;
	}

	async migrate(options: MigrationOptions): Promise<MigrationResult>
	{
		return this.strategy.migrate(options);
	}
}
