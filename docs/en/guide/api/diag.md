# Diag

`chef.diag.*` — diagnostic functions that operate over **a set of extensions**. Each returns [`ChefDataResult<T>`](./response-format) — a simple wrapper with `data` and `error`.

For per-extension equivalents see [Package](./package#diagnostics).

## Subcommands

| Method                       | What it does                                                            | `data` type                               |
|------------------------------|-------------------------------------------------------------------------|-------------------------------------------|
| `chef.diag.topUsed`          | Most popular extensions — most depended-on                              | `Array<{ name; dependents }>`             |
| `chef.diag.topDeps`          | Extensions with the most direct dependencies                            | `Array<{ name; count }>`                  |
| `chef.diag.topBundleSize`    | Heaviest bundles                                                        | `Array<{ name; js; css; assets; total }>` |
| `chef.diag.unusedDeps`       | Extensions with unused dependencies (full analysis)                     | `Array<{ name; unused: string[] }>`       |
| `chef.diag.circularDeps`     | Cycles in extension-level dependencies (via `config.php rel`)           | `Array<{ name; cycles: string[][] }>`     |
| `chef.diag.circularImports`  | Cycles in source imports (between files)                                | `Array<{ name; cycles: string[][] }>`     |

## Common options

All methods accept:

| Field       | Type                 | Description                                                       |
|-------------|----------------------|-------------------------------------------------------------------|
| `cwd`       | `string`             | Working directory. Defaults to `process.cwd()`.                   |
| `extension` | `string \| string[]` | Restrict the set (default: all extensions in the project).        |
| `path`      | `string`             | Directory to scan (default: project root).                        |

`extension` and `path` are mutually exclusive — pass one or the other.

Ranking methods (`topUsed`, `topDeps`, `topBundleSize`, `unusedDeps`) also accept `limit?: number`.

`topBundleSize` additionally accepts `sortBy?: 'js' | 'css' | 'assets' | 'total'`.

## Example: top-10 most popular

```ts
import { chef } from '@bitrix/chef';

const r = await chef.diag.topUsed({ limit: 10 });

for (const item of r.data ?? [])
{
  console.log(`${item.name}: ${item.dependents} dependents`);
}
```

## Example: top-5 by JS size

```ts
const r = await chef.diag.topBundleSize({ limit: 5, sortBy: 'js' });

for (const item of r.data ?? [])
{
  console.log(`${item.name}: js ${(item.js / 1024).toFixed(1)} KB`);
}
```

## Example: find every cycle

```ts
const r = await chef.diag.circularDeps();

for (const ext of r.data ?? [])
{
  console.log(`\n${ext.name}:`);
  for (const cycle of ext.cycles)
  {
    console.log(`  ${cycle.join(' → ')}`);
  }
}
```

## Example: restrict the set with a pattern

```ts
const r = await chef.diag.unusedDeps({ extension: 'ui.*', limit: 20 });
```

## What counts as "usage" in `unusedDeps`

`chef.diag.unusedDeps` looks at:

- `import ... from 'extension.name'` and side-effect `import 'extension.name'`
- `Reflection.getClass('BX.X.Y')`, `Runtime.getClass('BX.X.Y')`
- Direct namespace expressions like `BX.X.Y`, matched against `exportedGlobals` of other extensions

`BX.loadExtension` / `Runtime.loadExtension` are **not** counted — they load extensions dynamically without declaring a dependency.

A simplified but fast per-extension counterpart is `pkg.findUnusedDependencies()`. It only looks at `import` statements without namespace analysis.

## Diag for one extension

When you need the same checks on a single package — use `Package` methods:

```ts
const pkg = await chef.getPackage('main.core');
if (!pkg)
{
  return;
}

await pkg.findCircularDependencies();    // string[][]
await pkg.findCircularImports();         // string[][]
await pkg.findUnusedDependencies();      // string[]
await pkg.getHeaviestDependencies();     // top dependencies by weight
```

See the [Package page](./package#diagnostics).
