# Response format

`--reporter json` uses **two response shapes** depending on the nature of the command.

## Shared: metadata and `error`

Every response starts with the same set of fields:

```jsonc
{
  "chefVersion": "1.10.0",   // chef version
  "cwd": "/path/to/project", // working directory the command was run from
  "success": true,           // overall success
  "command": "build"         // 'build' | 'lint' | 'test' | 'typecheck' | 'diag.<sub>'
}
```

`error` appears at the root **only** on a catastrophic failure that prevents the command from getting started (e.g. `cwd` doesn't exist, project root not detected, conflicting options):

```jsonc
{
  "success": false,
  "error": {
    "code": "CF5001",
    "message": "Working directory does not exist: /nope"
  },
  ...
}
```

If the command did get to actual work and failed on a specific extension, the root `error` is absent and per-extension errors land in `extensions[].errors[]`.

## Shape 1: operations (`build`, `lint`, `test`, `typecheck`)

```ts
type JsonOperationResult<TDetails, TSummaryExtras = {}> = {
  chefVersion: string;
  cwd: string;
  success: boolean;
  command: string;
  extensions: JsonExtensionResult<TDetails>[];
  notFound: { name: string; reason: string }[];
  summary: JsonSummary & TSummaryExtras;
  error?: JsonErrorPayload;
};
```

- `extensions[]` — per-extension results.
- `notFound[]` — names/patterns that didn't resolve to an existing extension. Doesn't make `success: false` on its own — let your consumer decide.
- `summary` — totals across extensions. `total/passed/failed` count extensions. Aggregates over inner units (tests, lint messages) live in command-specific summary fields.

### `JsonExtensionResult<TDetails>`

```ts
type JsonExtensionResult<TDetails> = {
  name: string;
  path: string;          // absolute path
  success: boolean;
  durationMs: number;
  details: TDetails;     // command-specific — see below
  errors: JsonErrorPayload[];
  warnings: JsonErrorPayload[];
};
```

### `JsonSummary`

```ts
type JsonSummary = {
  total: number;       // total extensions
  passed: number;
  failed: number;
  durationMs: number;
  errorCount: number;  // sum across extensions[].errors
  warningCount: number;
};
```

Command-specific extras:

| Command     | Extra summary fields                                                      |
|-------------|---------------------------------------------------------------------------|
| `build`     | —                                                                         |
| `lint`      | `fixedCount`                                                              |
| `test`      | `tests: { total, passed, failed, skipped }` — totals across actual tests  |
| `typecheck` | `skippedCount` — extensions skipped as non-TypeScript                     |

### `JsonErrorPayload`

```ts
type JsonErrorPayload = {
  code: string;          // CF code or ESLint rule id
  message: string;
  file?: string;         // absolute path when location is known
  line?: number;
  column?: number;
  frame?: string;        // source snippet with the line marked — for build/typecheck/test
};
```

### `details` per command

#### `build`

```ts
type BuildDetails = {
  bundles: { file: string; size: number }[];  // file is relative to extensions[].path
  dependencies: string[];
  standalone: boolean;
};
```

Example:

```jsonc
{
  "name": "ui.buttons",
  "path": "/Users/.../ui/install/js/ui/buttons",
  "success": true,
  "durationMs": 3295,
  "details": {
    "bundles": [
      { "file": "ui.buttons.bundle.js", "size": 92007 },
      { "file": "ui.buttons.bundle.css", "size": 91087 }
    ],
    "dependencies": ["main.core", "ui.cnt"],
    "standalone": false
  },
  "errors": [],
  "warnings": [
    {
      "code": "CF1006",
      "message": "Circular dependency: src/index.js -> src/base-button.js -> src/index.js"
    }
  ]
}
```

#### `lint`

```ts
type LintDetails = {
  errorCount: number;
  warningCount: number;
  fixedCount: number;
  skipped: boolean;
  skipReason?: string;
};
```

Linter messages live in `errors[]` and `warnings[]` of the extension. Group them by file yourself (`jq 'group_by(.file)'`).

#### `typecheck`

```ts
type TypecheckDetails = {
  skipped: boolean;       // true for non-TS extensions
  skipReason?: string;
  errorCount: number;
};
```

TS errors are in `errors[]` of the extension, with a `frame` field (source snippet).

#### `test`

```ts
type TestDetails = {
  unit: TestKindDetails;
  e2e: TestKindDetails;
};

type TestKindDetails = {
  ran: boolean;
  skipReason?: string;
  durationMs: number;
  browsers: string[];      // 'chromium', 'firefox', 'webkit' — actual names
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  tests: TestEntry[];
  consoleLogs: { type: string; text: string }[];
};

type TestEntry = {
  suite: string[];                                  // suite path (describe/context chain)
  title: string;
  status: 'passed' | 'failed' | 'skipped';
  results: Record<string, BrowserTestResult>;       // key = browser name
};

type BrowserTestResult = {
  status: 'passed' | 'failed' | 'skipped';
  durationMs?: number;
  failure?: TestFailure;
};

type TestFailure = {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  frame?: string;                                   // source snippet with a pointer
  diff?: { actual: unknown; expected: unknown };    // for assert.deepEqual etc.
};
```

By default unit tests run in **all** browsers configured in `playwright.config.ts`. Use `--project chromium` to narrow to one.

For each failed test a record lands in `extensions[].errors[]` with `frame`/`file`/`line`/`column` — without a full stack trace.

## Shape 2: reports (`diag.*`)

```ts
type JsonReportResult<TData> = {
  chefVersion: string;
  cwd: string;
  success: boolean;
  command: string;             // 'diag.top-used', 'diag.circular-deps', ...
  data: TData;                 // see table below
  durationMs: number;
  error?: JsonErrorPayload;
};
```

There's no `extensions[]` — instead a single `data` block carries the subcommand-specific shape.

| Command                       | `data`                                                                                |
|-------------------------------|---------------------------------------------------------------------------------------|
| `diag top-used`               | `{ scanned, results: { name, dependents }[] }`                                        |
| `diag top-deps`               | `{ scanned, results: { name, directDeps }[] }`                                        |
| `diag top-deps-tree`          | `{ scanned, results: { name, treeSize }[] }`                                          |
| `diag top-bundle-size`        | `{ scanned, sortBy, results: { name, js, css, assets, total }[] }`                    |
| `diag top-total-size`         | `{ scanned, sortBy, results: { name, ownTotal, total, directDeps, treeDeps }[] }`     |
| `diag unused-deps`            | `{ scanned, results: { name, unused: string[] }[] }`                                  |
| `diag unused`                 | `{ scanned, results: { name }[] }`                                                    |
| `diag circular-deps`          | `{ scanned, results: { name, cycles: string[][] }[] }`                                |
| `diag circular-imports`       | `{ scanned, results: { name, cycles: string[][] }[] }`                                |
| `diag find-usages`            | `{ extension, usages: { type, file, line, content }[] }`                              |
| `diag deps-tree`              | tagged union by `mode`: `'tree' \| 'flat' \| 'why' \| 'not-found'`                    |
| `diag bundle-size`            | `{ extension, own, dependencies?, total? }` or `{ extension, notFound: true }`        |
| `diag config`                 | tagged union by `mode`: `'match' \| 'except' \| 'missing'`                            |

For exact field shapes see TypeScript definitions in `src/reporters/json/diag.ts`.
