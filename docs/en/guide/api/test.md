# Test

`chef.test(options)` — runs unit and/or e2e tests in the specified extensions through Playwright. Returns [`ChefResult<TestDetails>`](./response-format).

## Signature

```ts
chef.test(options?: TestOptions): Promise<ChefResult<TestDetails>>
```

## Options

| Field       | Type                                         | Description                                            |
|-------------|----------------------------------------------|--------------------------------------------------------|
| `extension` | `string \| string[]`                         | Extension names/patterns.                              |
| `path`      | `string`                                     | Directory to scan.                                     |
| `cwd`       | `string`                                     | Working directory. Defaults to `process.cwd()`.        |
| `kind`      | `'unit' \| 'e2e' \| 'all'`                   | What to run. Defaults to `'all'`.                      |
| `headed`    | `boolean`                                    | Headed browser mode.                                   |
| `debug`     | `boolean`                                    | Debug mode (slower, more logs).                        |
| `grep`      | `string`                                     | Run only tests matching the pattern.                   |
| `browsers`  | `Array<'chromium' \| 'firefox' \| 'webkit'>` | Specific browsers (for unit tests).                    |
| `file`      | `string`                                     | Specific test file.                                    |
| `project`   | `string \| string[]`                         | Playwright projects for e2e.                           |

If neither `extension` nor `path` is given — tests for every extension are run. `extension` and `path` are mutually exclusive.

## `TestDetails` shape

```ts
type TestDetails = {
  runs: TestRunDetails[];     // a separate run per kind/browser
  passed: number;
  failed: number;
  skipped: number;
};

type TestRunDetails = {
  kind: 'unit' | 'e2e';
  passed: number;
  failed: number;
  skipped: number;
  failures: Array<{
    suite: string[];
    title: string;
    message: string;
    stack?: string;
  }>;
};
```

Each run (unit per browser, e2e separately) is its own entry in `runs`. Top-level numbers are sums across `runs`.

## Example: run unit tests

```ts
import { chef } from '@bitrix/chef';

const result = await chef.test({
  extension: 'main.core',
  kind: 'unit',
});

if (!result.ok)
{
  process.exit(1);
}
```

## Example: parse failures

```ts
const result = await chef.test({ extension: 'ui.*', kind: 'unit' });

for (const ext of result.extensions)
{
  if (ext.ok || !ext.details) continue;

  console.log(`\n${ext.name}: ${ext.details.failed} tests failed`);

  for (const run of ext.details.runs)
  {
    for (const failure of run.failures)
    {
      const path = [...failure.suite, failure.title].join(' › ');
      console.log(`  ✗ ${path}`);
      console.log(`    ${failure.message}`);
    }
  }
}
```

## Example: specific browsers

```ts
const result = await chef.test({
  extension: 'main.core',
  kind: 'unit',
  browsers: ['chromium'],
  grep: 'BX.Type',
});
```

## Example: e2e

```ts
const result = await chef.test({
  extension: 'ui.bbcode.editor',
  kind: 'e2e',
  headed: true,
});
```

## Testing one through `Package`

```ts
const pkg = await chef.getPackage('main.core');
if (!pkg)
{
  return;
}

if (await pkg.hasUnitTests())
{
  const result = await pkg.test({ kind: 'unit' });
  console.log(`${result.details?.passed} passed`);
}
```

See the [Package page](./package#test).
