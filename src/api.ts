import { build } from './api/build';
import { lint } from './api/lint';
import { test } from './api/test';
import { typecheck } from './api/typecheck';
import { resolve } from './api/resolve';
import { diag } from './api/diag';
import { getPackage } from './api/get-package';
import { findPackages } from './api/find-packages';

export const chef = {
	build,
	lint,
	test,
	typecheck,
	resolve,
	diag,
	getPackage,
	findPackages,
};

export { Package } from './api/package';

export type {
	BuildOptions,
	BuildSingleOptions,
	BuildDetails,
	BuildExtensionResult,
	BuildApiResult,
	BuildSummaryExtras,
} from './api/build';

export type {
	LintOptions,
	LintSingleOptions,
	LintDetails,
	LintFileEntry,
	LintFileMessage,
	LintExtensionResult,
	LintApiResult,
	LintSummaryExtras,
} from './api/lint';

export type {
	TestOptions,
	TestSingleOptions,
	TestKind,
	TestDetails,
	TestRunDetails,
	TestFailure,
	TestExtensionResult,
	TestApiResult,
	TestSummaryExtras,
} from './api/test';

export type {
	TypecheckOptions,
	TypecheckSingleOptions,
	TypecheckDetails,
	TypecheckMessage,
	TypecheckExtensionResult,
	TypecheckApiResult,
	TypecheckSummaryExtras,
} from './api/typecheck';

export type {
	ResolveOptions,
	ResolveData,
	ResolvedExtension,
	ResolveApiResult,
} from './api/resolve';

export type {
	DiagBaseOptions,
	TopUsedOptions,
	TopUsedItem,
	TopDepsOptions,
	TopDepsItem,
	TopBundleSizeOptions,
	TopBundleSizeItem,
	UnusedDepsApiOptions,
	UnusedDepsItem,
	CircularDepsItem,
	CircularImportsItem,
} from './api/diag';

export type {
	GetPackageOptions,
} from './api/get-package';

export type {
	FindPackagesOptions,
} from './api/find-packages';

export type {
	PackageBundleSize,
	DependencySizeInfo,
	HeaviestDependenciesOptions,
} from './api/package';

export type {
	ChefResult,
	ChefExtensionResult,
	ChefDataResult,
	ChefErrorPayload,
	ChefNotFoundEntry,
	ChefSummary,
	BaseApiOptions,
} from './api/types';

export type { TargetSelector } from './api/resolve-targets';

export { CF } from './diagnostics/diagnostic-codes';
export type { DiagnosticCode } from './diagnostics/diagnostic-codes';

export type { BundleConfig } from './modules/config/bundle/bundle-config';
export type { BundleConfigManager } from './modules/config/bundle/bundle-config-manager';
export type { PhpConfigManager } from './modules/config/php/php-config-manager';
export type { PackageSnapshot, SnapshotField } from './commands/diag/package-snapshot';
export type { DependencyNode } from './modules/packages/types/dependency-node';
