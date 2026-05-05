# Build

`chef.build(options)` — builds the specified extensions through Rollup. Returns [`ChefResult<BuildDetails>`](./response-format) — the unified bulk-operation format.

## Signature

```ts
chef.build(options?: BuildOptions): Promise<ChefResult<BuildDetails>>
```

## Options

| Field       | Type                 | Description                                                              |
|-------------|----------------------|--------------------------------------------------------------------------|
| `extension` | `string \| string[]` | Extension names/patterns: `'main.core'`, `'ui.*'`, `['a', 'b']`.         |
| `path`      | `string`             | Directory to scan (absolute, or relative to `cwd`).                      |
| `cwd`       | `string`             | Working directory. Defaults to `process.cwd()`.                          |
| `force`     | `boolean`            | Override `chef.config` option restrictions. Defaults to `false`.         |

If neither `extension` nor `path` is given — every extension in the project is built. `extension` and `path` are mutually exclusive — pass one or the other.

## `BuildDetails` shape

```ts
type BuildDetails = {
  bundles: Array<{ fileName: string; size: number }>;  // output files
  dependencies: string[];                              // detected dependencies
  standalone: boolean;                                 // standalone mode
};
```

In addition, each `extensions[i]` may carry:

- `error` — critical build error (Rollup crash, missing file, etc.)
- `warnings[]` — warnings with `CF1xxx` codes (cycles, unused exports, baseline warnings, etc.)

## Example: build a single extension

```ts
import { chef } from '@bitrix/chef';

const result = await chef.build({ extension: 'main.core' });

if (!result.ok)
{
  console.error('Build failed');
  process.exit(1);
}
```

## Example: build several by pattern

```ts
const result = await chef.build({ extension: 'ui.bbcode.*' });

console.log(`Built: ${result.summary.passed}/${result.summary.total}`);
console.log(`Time: ${(result.summary.durationMs / 1000).toFixed(2)}s`);
```

## Example: handle errors

```ts
const result = await chef.build({ extension: ['main.core', 'crm.timeline'] });

for (const ext of result.extensions)
{
  if (!ext.ok)
  {
    console.log(`✗ ${ext.name}: ${ext.error?.message}`);
    if (ext.error?.file)
    {
      console.log(`  ${ext.error.file}:${ext.error.line}:${ext.error.column}`);
    }
  }
}

for (const missing of result.notFound)
{
  console.log(`? ${missing.name} — ${missing.reason}`);
}
```

## Example: warnings only

```ts
const result = await chef.build({ extension: 'ui.*' });

for (const ext of result.extensions)
{
  for (const warning of ext.warnings ?? [])
  {
    console.log(`[${warning.code}] ${ext.name}: ${warning.message}`);
  }
}
```

## Building one through `Package`

If you already have an extension object, calling `pkg.build()` is more convenient — it returns `ChefExtensionResult<BuildDetails>` (a single extension, without the bulk-result wrapper):

```ts
const pkg = await chef.getPackage('main.core');
if (!pkg)
{
  return;
}

const result = await pkg.build({ force: true });
if (!result.ok)
{
  console.error(result.error?.message);
}
```

See the [Package page](./package#build).
