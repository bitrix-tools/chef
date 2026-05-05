# Lint

`chef.lint(options)` — runs ESLint on the sources of the specified extensions. Returns [`ChefResult<LintDetails>`](./response-format).

## Signature

```ts
chef.lint(options?: LintOptions): Promise<ChefResult<LintDetails>>
```

## Options

| Field       | Type                 | Description                                                          |
|-------------|----------------------|----------------------------------------------------------------------|
| `extension` | `string \| string[]` | Extension names/patterns.                                            |
| `path`      | `string`             | Directory to scan.                                                   |
| `cwd`       | `string`             | Working directory. Defaults to `process.cwd()`.                      |
| `fix`       | `boolean`            | Auto-fix what is fixable. Defaults to `false`.                       |
| `files`     | `string[]`           | Specific files (glob patterns relative to `src/`).                   |
| `cache`     | `boolean`            | Use ESLint cache. Defaults to `true`.                                |
| `exclude`   | `string[]`           | Glob patterns to exclude.                                            |

If neither `extension` nor `path` is given — every extension in the project is linted. `extension` and `path` are mutually exclusive.

## `LintDetails` shape

```ts
type LintDetails = {
  errorCount: number;
  warningCount: number;
  skipped: boolean;
  skipReason?: string;
  files: Array<{
    filePath: string;
    messages: Array<{
      ruleId: string | null;
      severity: 'error' | 'warning';
      line: number;
      column: number;
      message: string;
    }>;
  }>;
};
```

`details.files` only contains files that have at least one message. Zero issues — empty array.

## `summary` shape

Alongside the common fields (extension counters), `chef.lint` adds aggregates over lint messages across the whole set:

```ts
type LintApiResult['summary'] = {
  total: number;        // how many extensions were processed
  passed: number;       // how many passed with no errors
  failed: number;       // how many had errors
  durationMs: number;

  // lint-specific
  errorCount: number;     // total error messages across all extensions
  warningCount: number;   // total warning messages
};
```

`errorCount`/`warningCount` are summed across `details.files[].messages[]` of all extensions.

## Example: lint and fail on errors

```ts
import { chef } from '@bitrix/chef';

const result = await chef.lint({ extension: 'ui.*' });

if (!result.ok)
{
  console.error(`Lint found problems in ${result.summary.failed} extensions`);
  process.exit(1);
}
```

## Example: detailed report

```ts
const result = await chef.lint({ extension: 'ui.*' });

for (const ext of result.extensions)
{
  if (!ext.details) continue;

  if (ext.details.errorCount === 0 && ext.details.warningCount === 0)
  {
    continue;
  }

  console.log(`\n${ext.name}: ${ext.details.errorCount} errors, ${ext.details.warningCount} warnings`);

  for (const file of ext.details.files)
  {
    for (const msg of file.messages)
    {
      const sign = msg.severity === 'error' ? '✗' : '!';
      console.log(`  ${sign} ${file.filePath}:${msg.line}:${msg.column}  ${msg.ruleId ?? '?'}  ${msg.message}`);
    }
  }
}
```

## Example: auto-fix

```ts
const result = await chef.lint({
  extension: 'ui.bbcode.*',
  fix: true,
});

console.log(`Fixed where possible. Remaining errors: ${result.summary.failed}`);
```

## Linting one through `Package`

```ts
const pkg = await chef.getPackage('main.core');
if (!pkg)
{
  return;
}

const result = await pkg.lint({ fix: true });
if (!result.ok)
{
  console.log(`${result.details?.errorCount} errors remain after fix`);
}
```

See the [Package page](./package#lint).
