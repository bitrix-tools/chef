# Type-check

`chef.typecheck(options)` — checks types in TypeScript extensions via `tsc`. Returns [`ChefResult<TypecheckDetails>`](./response-format).

JavaScript extensions are automatically skipped (status `skipped` with a reason).

## Signature

```ts
chef.typecheck(options?: TypecheckOptions): Promise<ChefResult<TypecheckDetails>>
```

## Options

| Field       | Type                 | Description                                                        |
|-------------|----------------------|--------------------------------------------------------------------|
| `extension` | `string \| string[]` | Extension names/patterns.                                          |
| `path`      | `string`             | Directory to scan.                                                 |
| `cwd`       | `string`             | Working directory. Defaults to `process.cwd()`.                    |
| `files`     | `string[]`           | Specific files (relative to the extension root).                   |
| `exclude`   | `string[]`           | Files to exclude (relative to the extension root).                 |

If neither `extension` nor `path` is given — every TypeScript extension is checked. `extension` and `path` are mutually exclusive.

## `TypecheckDetails` shape

```ts
type TypecheckDetails = {
  skipped: boolean;
  skipReason?: string;
  errors: Array<{
    code?: string;
    message: string;
    file?: string;
    line?: number;
    column?: number;
    frame?: string;
  }>;
};
```

`code` is the TypeScript diagnostic code (e.g. `TS2322`). `frame` is a snippet around the error location, when available.

## Example: check and fail on errors

```ts
import { chef } from '@bitrix/chef';

const result = await chef.typecheck({ extension: 'ui.*' });

if (!result.ok)
{
  process.exit(1);
}
```

## Example: detailed output

```ts
const result = await chef.typecheck({ extension: 'ui.*' });

for (const ext of result.extensions)
{
  if (!ext.details) continue;

  if (ext.details.skipped)
  {
    console.log(`- ${ext.name} (${ext.details.skipReason})`);
    continue;
  }

  if (ext.details.errors.length === 0)
  {
    console.log(`✓ ${ext.name}`);
    continue;
  }

  console.log(`\n✗ ${ext.name}`);
  for (const err of ext.details.errors)
  {
    const loc = err.file ? `${err.file}:${err.line}:${err.column}` : '';
    console.log(`  ${err.code ?? ''} ${loc}`);
    console.log(`    ${err.message}`);
  }
}
```

## Type-check one through `Package`

```ts
const pkg = await chef.getPackage('main.core');
if (!pkg)
{
  return;
}

if (pkg.isTypeScript())
{
  const result = await pkg.typecheck();
  console.log(`Errors: ${result.details?.errors.length ?? 0}`);
}
```

See the [Package page](./package#typecheck).
