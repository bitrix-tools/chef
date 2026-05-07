export { emitJson } from './emit';

export { build } from './build';
export type { BuildOptions, BuildJsonResult, BuildExtensionResult, BuildDetails, BuildBundle } from './build';

export { lint } from './lint';
export type { LintOptions, LintJsonResult, LintExtensionResult, LintDetails } from './lint';

export { test } from './test';
export type {
	TestOptions,
	TestJsonResult,
	TestExtensionResult,
	TestDetails,
	TestKindDetails,
	TestEntry,
	TestKind,
	TestStatus,
	BrowserTestResult,
	TestFailure,
} from './test';

export { typecheck } from './typecheck';
export type {
	TypecheckOptions,
	TypecheckJsonResult,
	TypecheckExtensionResult,
	TypecheckDetails,
} from './typecheck';

export { diag } from './diag';
export type {
	DiagBaseOptions,
	ListDiagData,
	TopUsedOptions, TopUsedItem, TopUsedData,
	TopDepsOptions, TopDepsItem, TopDepsData,
	TopDepsTreeOptions, TopDepsTreeItem, TopDepsTreeData,
	TopBundleSizeOptions, TopBundleSizeItem, TopBundleSizeData,
	TopTotalSizeOptions, TopTotalSizeItem, TopTotalSizeData,
	UnusedDepsApiOptions, UnusedDepsItem, UnusedDepsData,
	UnusedOptions, UnusedItem, UnusedData,
	CircularDepsItem, CircularDepsData,
	CircularImportsItem, CircularImportsData,
	FindUsagesOptions, FindUsagesItem, FindUsagesData,
	DepsTreeOptions, DepsTreeData,
	BundleSizeOptions, BundleSizeData,
	ConfigOptions, ConfigData, ConfigMode,
} from './diag';

export type {
	JsonOperationResult,
	JsonReportResult,
	JsonExtensionResult,
	JsonErrorPayload,
	JsonSummary,
	JsonInputOptions,
	JsonNotFoundEntry,
	JsonMeta,
} from './types';
