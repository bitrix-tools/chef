# Extension (Package)

`Package` is the facade for fine-grained work with a single extension. Once you have an instance, you can read its metadata, configs, dependencies, sizes, look for problems, take snapshots, and run actions (build/lint/test/typecheck).

## Obtaining an instance

### `chef.getPackage`

```ts
chef.getPackage(name: string, options?: { cwd?: string }): Promise<Package | null>
```

Resolves a single extension by name. Returns `null` if the extension is not found or if `cwd` is not inside a Bitrix project.

```ts
import { chef } from '@bitrix/chef';

const pkg = await chef.getPackage('main.core');
if (!pkg)
{
  console.error('main.core not found');
  process.exit(1);
}
```

### `chef.findPackages`

```ts
chef.findPackages(options?: {
  cwd?: string;
  extension?: string | string[];
  path?: string;
}): Promise<Package[]>
```

Returns an array: by name/pattern, by directory, or every extension in the project. Environment failures yield an empty array. Throws `ChefError(CF.OPTION_DENIED)` when called with both `extension` and `path`.

```ts
const ui = await chef.findPackages({ extension: 'ui.*' });
const inDir = await chef.findPackages({ path: './modules/ui' });
const all = await chef.findPackages();
```

## Method groups

- [Metadata](#metadata) — name, path, namespace, type
- [File paths](#paths) — entry, outputs, sources
- [Configs](#configs) — bundle.config, config.php
- [Dependencies](#dependencies) — direct, tree, flattened
- [Tests](#tests) — presence of unit/e2e
- [Sizes](#sizes) — own, dependencies, total, heaviest
- [Finding problems](#diagnostics) — cycles, unused
- [Snapshot](#snapshot) — `PackageSnapshot` for custom analyzers
- [Actions](#actions) — build, lint, test, typecheck

## <a id="metadata"></a> Metadata

```ts
pkg.getName();         // 'main.core'
pkg.getPath();         // absolute path to the directory
pkg.getModuleName();   // 'main'
pkg.getNamespace();    // 'BX.Main' — from bundle.config 'namespace'
pkg.isTypeScript();    // true if the entry point is .ts
```

## <a id="paths"></a> File paths

```ts
pkg.getInputPath();        // absolute path to the entry point
pkg.getOutputJsPath();     // where the JS bundle is written
pkg.getOutputCssPath();    // where the CSS bundle is written
pkg.getSourceFiles();      // string[] — every .js/.ts in src/
```

## <a id="configs"></a> Configs

```ts
const bundleConfig = pkg.getBundleConfig();    // BundleConfigManager
const namespace = bundleConfig.get('namespace');
const targets = bundleConfig.get('targets');

const phpConfig = pkg.getPhpConfig();          // PhpConfigManager
const rel = phpConfig.get('rel');              // dependency array from config.php
const includes = phpConfig.get('includes');    // include files
```

`BundleConfigManager` and `PhpConfigManager` are chef-internal classes exported as types. Their shape is stable, but treat their methods as read-only (`get`/`has`).

## <a id="dependencies"></a> Dependencies

```ts
await pkg.getDependencies();             // string[] — direct
await pkg.getDependenciesTree();         // DependencyNode[] — full tree
await pkg.getFlattenedDependencies();    // flat list of every transitive dep
await pkg.getDependenciesTreeSize();     // number of unique deps in the tree
```

`DependencyNode`:

```ts
type DependencyNode = {
  name: string;
  visited?: boolean;
  children: DependencyNode[];
  bundlesSize?: { js: number; css: number };  // when withSize: true
};
```

With `withSize: true` the tree gets per-node sizes attached:

```ts
const tree = await pkg.getDependenciesTree({ withSize: true });
```

## <a id="tests"></a> Tests

```ts
await pkg.hasUnitTests();       // boolean
await pkg.hasEndToEndTests();   // boolean
```

Walks `test/unit/` and `test/e2e/` (and the legacy `test/`) and looks for `*.test.ts`/`*.spec.ts`.

## <a id="sizes"></a> Sizes

```ts
pkg.getBundleSize();
// { js: 331942, css: 0, assets: 914, total: 332856 }

await pkg.getDependenciesSize();
// { js: 1234567, css: 12345, assets: 4321 } — sum across all transitive deps

await pkg.getTotalTransferredSize();
// { js, css, assets, total } — own + tree
```

### `getHeaviestDependencies`

Top dependencies by weight — what pulls the most into this extension:

```ts
await pkg.getHeaviestDependencies({ limit?: number; sortBy?: 'total' | 'js' | 'css' | 'assets' })
```

Returns:

```ts
Array<{
  name: string;
  js: number;
  css: number;
  assets: number;
  total: number;
}>
```

Example:

```ts
const heavy = await pkg.getHeaviestDependencies({ limit: 10, sortBy: 'js' });

console.log(`\nTop-10 by JS pulled in via ${pkg.getName()}:`);
for (const dep of heavy)
{
  console.log(`  ${dep.name}: ${(dep.js / 1024).toFixed(1)} KB`);
}
```

## <a id="diagnostics"></a> Finding problems

```ts
await pkg.findCircularDependencies();    // string[][] — cycles between extensions
await pkg.findCircularImports();         // string[][] — cycles between source files
await pkg.findUnusedDependencies();      // string[] — deps without import statements
```

### `findCircularDependencies`

Looks for direct cycles in `config.php rel`: `A → A` (self-dep), `A → B → A` (mutual).

```ts
const cycles = await pkg.findCircularDependencies();
for (const cycle of cycles)
{
  console.log(cycle.join(' → '));
}
```

### `findCircularImports`

Parses `import`/`export` statements with relative paths (`./`, `../`) in every source file of the extension and builds a file graph. Cycles are returned as arrays of relative paths.

```ts
const cycles = await pkg.findCircularImports();
console.log(`Found ${cycles.length} cycles`);
```

### `findUnusedDependencies`

**Simplified** analysis: only looks at `import` statements. Doesn't catch namespace expressions like `BX.Main.Foo`. Fast.

For a **full** project-wide analysis, use [`chef.diag.unusedDeps`](./diag).

## <a id="snapshot"></a> Snapshot

For custom analyzers you can take a flat object with selected fields:

```ts
const snapshot = await pkg.snapshot([
  'dependencies',
  'bundleSize',
  'exportedGlobals',
  'importedExtensions',
]);
```

`SnapshotField`:

```ts
type SnapshotField =
  | 'dependencies'
  | 'dependencyTreeSize'
  | 'bundleSize'
  | 'assetsSize'
  | 'totalSize'
  | 'bundleConfig'
  | 'exportedGlobals'
  | 'importedExtensions'
  | 'usedNamespaces';
```

Only requested fields are populated — saves time on large projects.

## <a id="actions"></a> Actions

The methods return the same `ChefExtensionResult<...>` as a single element from bulk `chef.build/lint/test/typecheck` — the data shape is uniform, handling is unified.

### `build`

```ts
await pkg.build({ force?: boolean }): Promise<ChefExtensionResult<BuildDetails>>
```

```ts
const result = await pkg.build({ force: true });

if (!result.ok)
{
  console.error(result.error?.message);
}

console.log(`Bundles: ${result.details?.bundles.length}`);
console.log(`Warnings: ${result.warnings?.length ?? 0}`);
```

### `lint`

```ts
await pkg.lint({
  fix?: boolean;
  files?: string[];
  cache?: boolean;
  exclude?: string[];
}): Promise<ChefExtensionResult<LintDetails>>
```

### `test`

```ts
await pkg.test({
  kind?: 'unit' | 'e2e' | 'all';
  headed?: boolean;
  debug?: boolean;
  grep?: string;
  browsers?: BrowserType[];
  file?: string;
  project?: string | string[];
}): Promise<ChefExtensionResult<TestDetails>>
```

### `typecheck`

```ts
await pkg.typecheck({
  files?: string[];
  exclude?: string[];
}): Promise<ChefExtensionResult<TypecheckDetails>>
```

## Larger example: a custom project report

```ts
import { chef } from '@bitrix/chef';

const packages = await chef.findPackages({ extension: 'ui.*' });
const report: Array<{ name: string; size: number; cycles: number; deps: number }> = [];

for (const pkg of packages)
{
  const size = pkg.getBundleSize();
  const cycles = await pkg.findCircularImports();
  const deps = await pkg.getDependencies();

  report.push({
    name: pkg.getName(),
    size: size.total,
    cycles: cycles.length,
    deps: deps.length,
  });
}

report.sort((a, b) => b.size - a.size);
console.table(report);
```

