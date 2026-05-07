# Error codes in JSON output

Every error and warning in the JSON response carries a `code`. The full list with descriptions is on the [Error codes](../errors) page. Below are the codes most commonly seen in JSON output.

## Where errors appear

- **`result.error`** — fatal failure before the command got to actual work (invalid `cwd`, project root missing, conflicting options).
- **`extensions[].errors[]` / `extensions[].warnings[]`** — per-extension errors and warnings.
- **`notFound[]`** — names/patterns that didn't resolve to an extension. Not fatal on its own.

## Environment (CF5xxx)

| Code                          | When it happens                                                          |
|-------------------------------|--------------------------------------------------------------------------|
| `CF.OUTSIDE_PROJECT_ROOT`     | `cwd` points outside the project root.                                   |
| `CF.PROJECT_ROOT_NOT_FOUND`   | Couldn't detect the Bitrix project root from the given `cwd`.            |
| `CF.INVALID_CWD`              | The directory doesn't exist.                                             |

These end up in `result.error`.

## Configuration / usage (CF2xxx)

| Code                       | When it happens                                                            |
|----------------------------|----------------------------------------------------------------------------|
| `CF.NOT_FOUND`             | Extension didn't match any name/pattern. Lands in `notFound[]`.            |
| `CF.PACKAGE_PROTECTED`     | Extension is marked `protected` and skipped.                               |
| `CF.OPTION_DENIED`         | Incompatible options (e.g. `--watch` with `--reporter json`). In `result.error`. |

## Build (CF1xxx)

Common codes in `extensions[].warnings` and `extensions[].errors` for `chef build`:

| Code                           | Meaning                                               |
|--------------------------------|-------------------------------------------------------|
| `CF.CIRCULAR_DEPENDENCY`       | Circular dependency between source files.             |
| `CF.UNRESOLVED_IMPORT`         | Import couldn't be resolved.                          |
| `CF.MISSING_EXPORT`            | An import targets a non-existent export.              |
| `CF.UNUSED_EXTERNAL_IMPORT`    | External import with no actual usage.                 |
| `CF.SYNTAX_ERROR`              | Syntax error.                                         |
| `CF.MINIFICATION_ERROR`        | Minifier failed.                                      |
| `CF.BASELINE_JS_UNSUPPORTED`   | JS feature unsupported by configured targets.         |
| `CF.BASELINE_CSS_UNSUPPORTED`  | CSS feature unsupported by configured targets.        |
| `CF.UNEXPECTED_BUILD_ERROR`    | Unexpected Rollup or plugin failure.                  |

## Lint (CF4xxx)

| Code                | Meaning                                                       |
|---------------------|---------------------------------------------------------------|
| `CF.LINT_FAILED`    | Linter found errors. Messages — in `extensions[].errors[]`.   |

The `code` of a linter message is the ESLint rule id (`no-console`, `import/no-default-export` etc.). `CF.LINT_FAILED` is a fallback when no rule id is available.

## Tests (CF3xxx)

| Code                              | Meaning                                              |
|-----------------------------------|------------------------------------------------------|
| `CF.TEST_FAILED`                  | At least one test failed.                            |
| `CF.PLAYWRIGHT_ERROR`             | Playwright launch error (e.g. browsers missing).     |
| `CF.UNKNOWN_BROWSER`              | Unknown browser was requested.                       |
| `CF.PLAYWRIGHT_CONFIG_NOT_FOUND`  | `playwright.config` not found.                       |

In `chef test` `extensions[].errors[]` each entry is one failed test in one browser.

## Type-check

| Code                  | Meaning                                                   |
|-----------------------|-----------------------------------------------------------|
| `CF.TS_TYPE_ERROR`    | Type-check found errors. `errors[]` carries frames.       |

In an `errors[]` entry `code` may be a TypeScript code (`TS2322`, `TS2304` etc.) — straight from the compiler.

## Internal (CF9xxx)

| Code                          | When it happens                                         |
|-------------------------------|---------------------------------------------------------|
| `CF.PACKAGE_READ_ERROR`       | Couldn't read the extension or its config.              |
| `CF.UNCAUGHT_EXCEPTION`       | Unexpected exception, normalized into the payload.      |

## Example: branching by code in shell

```bash
chef build main.core --reporter json | jq -e '
  if .error then
    if .error.code == "CF5002" then "no project root" | halt_error
    elif .error.code == "CF5001" then "bad cwd" | halt_error
    else .error.message | halt_error
    end
  else . end
'
```

## Full list

All chef codes are documented on the main [Error codes](../errors) page.
