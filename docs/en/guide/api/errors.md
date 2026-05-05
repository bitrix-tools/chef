# API error codes

Every error and warning in the API carries a code from chef's `CF` table. The full list with descriptions is on the [Error codes](../errors) page. Below — the codes you'll most often see in API results.

## Importing constants

```ts
import { CF, type DiagnosticCode } from '@bitrix/chef';

if (result.error?.code === CF.PROJECT_ROOT_NOT_FOUND)
{
  // ...
}
```

## Environment (CF5xxx)

| Code                         | When it occurs                                                          |
|------------------------------|-------------------------------------------------------------------------|
| `CF.OUTSIDE_PROJECT_ROOT`    | `cwd` points outside the project root.                                  |
| `CF.PROJECT_ROOT_NOT_FOUND`  | Could not detect a Bitrix project root from the given `cwd`.            |
| `CF.INVALID_CWD`             | The given directory does not exist.                                     |

These end up in `result.error` (fatal operation error).

## Configuration / usage (CF2xxx)

| Code                       | When it occurs                                                                  |
|----------------------------|---------------------------------------------------------------------------------|
| `CF.NOT_FOUND`             | Extension by the given name/pattern was not found. Goes to `result.notFound[]`. |
| `CF.PACKAGE_PROTECTED`     | Extension marked as `protected` — skipped.                                      |
| `CF.OPTION_DENIED`         | Incompatible options: `extension` and `path` together, or `--watch` and `--json` in the CLI. Goes to `result.error` (or `throw` from `chef.findPackages`). |

## Build (CF1xxx)

The most common codes in `extensions[].warnings` and `extensions[].error` for `chef.build`:

| Code                            | Meaning                                              |
|---------------------------------|------------------------------------------------------|
| `CF.CIRCULAR_DEPENDENCY`        | Circular file dependency inside the extension.       |
| `CF.UNRESOLVED_IMPORT`          | An import couldn't be resolved.                      |
| `CF.MISSING_EXPORT`             | An import refers to an export that doesn't exist.    |
| `CF.UNUSED_EXTERNAL_IMPORT`     | An external import that isn't used.                  |
| `CF.SYNTAX_ERROR`               | Syntax error.                                        |
| `CF.MINIFICATION_ERROR`         | Minifier failure.                                    |
| `CF.BASELINE_JS_UNSUPPORTED`    | A JS feature outside the targets is used.            |
| `CF.BASELINE_CSS_UNSUPPORTED`   | A CSS feature outside the targets is used.           |
| `CF.UNEXPECTED_BUILD_ERROR`     | Unexpected Rollup or plugin failure.                 |

## Lint (CF4xxx)

| Code                | Meaning                                                    |
|---------------------|------------------------------------------------------------|
| `CF.LINT_FAILED`    | Lint reported at least one error. See `details.files`.     |

## Tests (CF3xxx)

| Code                              | Meaning                                              |
|-----------------------------------|------------------------------------------------------|
| `CF.TEST_FAILED`                  | At least one test failed.                            |
| `CF.PLAYWRIGHT_ERROR`             | Playwright launch error (e.g. no browsers).          |
| `CF.UNKNOWN_BROWSER`              | Unknown browser requested.                           |
| `CF.PLAYWRIGHT_CONFIG_NOT_FOUND`  | `playwright.config` not found.                       |
| `CF.NO_E2E_TESTS`                 | No e2e tests.                                        |

## Type-check

In `details.errors[i].code` the TypeScript code (`TS2322`, `TS2304`, etc.) is passed through verbatim — exactly as the compiler emits it. At the `extensions[].error` level:

| Code                  | Meaning                                                  |
|-----------------------|----------------------------------------------------------|
| `CF.TS_TYPE_ERROR`    | Type-check found errors. See `details.errors`.           |

## Internal (CF9xxx)

| Code                       | When it occurs                                            |
|----------------------------|-----------------------------------------------------------|
| `CF.PACKAGE_READ_ERROR`    | Couldn't read an extension or its config.                 |
| `CF.UNCAUGHT_EXCEPTION`    | Unexpected exception, normalized into a payload.          |

## Example: branching by code

```ts
import { chef, CF } from '@bitrix/chef';

const result = await chef.build({ extension: 'main.core' });

if (result.error)
{
  switch (result.error.code)
  {
    case CF.PROJECT_ROOT_NOT_FOUND:
      console.error('Does not look like a Bitrix project');
      break;
    case CF.INVALID_CWD:
      console.error('The given path does not exist');
      break;
    default:
      console.error(result.error.message);
  }
  process.exit(1);
}
```

## Full list

All chef codes are listed on the main [Error codes](../errors) page. If you encounter a code in the API not covered here — it's normal, it lives in the master table.
