import type { MigrationOptions, MigrationResult } from './migration-types';

export abstract class MigrationStrategy
{
	abstract migrate(options: MigrationOptions): Promise<MigrationResult>;
}
