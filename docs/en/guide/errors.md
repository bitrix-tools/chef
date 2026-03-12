# Error Codes

During build, testing and other operations, Chef reports errors and warnings with diagnostic codes in the `CFxxxx` format:

```
✗ ui.my-extension
  [CF1002] Unexpected token (3:5)

  > 3 | const x = {;
      |            ^
```

The code helps you quickly identify the nature of the problem and find a solution.

## Categories

| Range | Category | Description |
|-------|----------|-------------|
| `CF1xxx` | Build | Errors and warnings during extension build |
| `CF2xxx` | Config | Configuration file errors |
| `CF3xxx` | Testing | Problems when running tests |
| `CF5xxx` | Environment | Environment and CLI errors |
| `CF9xxx` | Internal | Chef internal errors |

## CF1xxx — Build {#build}

### CF1001 — TypeScript Type Error {#CF1001}

TypeScript detected a type mismatch in the code.

```
✗ ui.my-extension
  [CF1001] TS2322: Type 'string' is not assignable to type 'number'.

  src/index.ts:5:7
```

**How to fix:**

Open the file at the specified line. The original TS error code is included in the message (e.g., `TS2322`) — look it up in the [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html).

Common cases:
- `TS2322` — incompatible types in assignment
- `TS2307` — module not found. Check that the extension exists and aliases are up to date (`chef init build`)
- `TS2345` — wrong argument type passed to a function

### CF1002 — Syntax Error {#CF1002}

JavaScript, TypeScript or CSS parsing error.

```
✗ ui.my-extension
  [CF1002] Unexpected token (3:5)

  > 3 | const x = {;
      |            ^
```

**How to fix:**

Open the file at the specified line and column. Common causes:
- Unclosed bracket, quote, or template string
- Missing comma or semicolon
- Invalid CSS syntax (unclosed block, selector error)

### CF1003 — Minification Error {#CF1003}

Failed to minify the bundle during production build.

**How to fix:**

Usually indicates code that was parsed successfully but contains constructs not supported by the minifier. Try building without `--production` — if the dev build succeeds, the issue is specifically with minification. Report the error to Chef developers.

### CF1004 — Concat File Not Found {#CF1004}

A file specified in the `concat` option of `bundle.config` does not exist.

```
⚠ ui.my-extension
  [CF1004] JS file not found: './src/legacy/utils.js'
```

**How to fix:**

Check the paths in the `concat` section of your `bundle.config`:

```ts
export default {
  input: 'src/index.ts',
  output: 'dist/index.bundle.js',
  concat: {
    js: [
      './src/legacy/utils.js',  // ← verify this file exists
      './dist/index.bundle.js',
    ],
  },
};
```

### CF1005 — Concat File Read Error {#CF1005}

A file from `concat` exists but cannot be read.

**How to fix:**

Check file permissions. Make sure the file is not corrupted and has a valid encoding.

### CF1006 — Circular Dependency {#CF1006}

Two or more modules import each other, forming a cycle.

```
⚠ ui.my-extension
  [CF1006] Circular dependency: src/a.ts → src/b.ts → src/a.ts
```

**How to fix:**

Circular dependencies can lead to `undefined` values on import. Options:
- **Extract shared code** into a separate module that both files import
- **Merge the modules** if they are tightly coupled
- **Use lazy imports** (`import()`) in one of the modules

::: tip
If the circular dependency doesn't cause runtime issues, the warning can be ignored. However, it's recommended to eliminate cycles for predictability.
:::

### CF1007 — Missing Export {#CF1007}

The imported name is not exported by the specified module.

```
✗ ui.my-extension
  [CF1007] 'formatDate' is not exported by 'src/utils.ts', imported by 'src/index.ts'
```

**How to fix:**

- Check that the name is spelled correctly (case-sensitive)
- Verify the function/class/variable is actually exported (`export`)
- If the name was renamed — update the import
- **If importing a TypeScript type** — use `import type`. Without `type`, the bundler looks for a runtime export that doesn't exist:

```ts
// ✗ Error: 'UserOptions' is not exported
import { UserOptions } from './types';

// ✓ Correct
import type { UserOptions } from './types';
```

### CF1008 — this Rewritten to undefined {#CF1008}

Usage of `this` at the top level of a module. When building in module format, top-level `this` is replaced with `undefined`.

**How to fix:**

- Replace `this` with `globalThis` or `window` if you need the global object
- If `this` is used inside a class or function — this is a false positive, safe to ignore

### CF1009 — Use of eval {#CF1009}

The code contains an `eval()` call.

**How to fix:**

`eval()` in a module context behaves differently than in regular scripts. Where possible, replace with alternatives (`new Function()`, `JSON.parse`, etc.).

::: warning
`eval()` is a serious security vulnerability. Avoid using it in production code.
:::

### CF1010 — Missing Global Variable Name {#CF1010}

No name specified for the global variable in IIFE format.

**How to fix:**

Add `namespace` to `bundle.config`:

```ts
export default {
  input: 'src/index.ts',
  output: 'dist/index.bundle.js',
  namespace: 'BX.MyExtension',
};
```

### CF1011 — Unused External Import {#CF1011}

A value imported from an external dependency is not used in the code.

**How to fix:**

Remove the unused import. If the import is needed for side effects, use `import 'module'` without destructuring.

### CF1012 — Unresolved Import {#CF1012}

The module specified in `import` was not found.

**How to fix:**

- Check the path is correct (relative paths must start with `./` or `../`)
- For npm packages — install the package (`npm install`)
- For Bitrix extensions — make sure the extension exists and is accessible

### CF1013 — Missing Name for IIFE Export {#CF1013}

The extension exports values but no name is specified for the IIFE wrapper.

**How to fix:**

Same as [CF1010](#CF1010) — specify `namespace` in `bundle.config`.

### CF1014 — Plugin Warning {#CF1014}

A general warning from one of the build plugins.

**How to fix:**

Read the warning text — it contains problem details. Usually a non-critical situation that doesn't require immediate action.

### CF1099 — Unknown Build Warning {#CF1099}

A Rollup warning that doesn't fall into any of the categories above.

**How to fix:**

Read the warning text. If the issue is unclear, report it to Chef developers with the full warning text.

## CF2xxx — Config {#config}

### CF2001 — Option Denied by Project Config {#CF2001}

A setting in `bundle.config` is denied by the project's `chef.config`.

**How to fix:**

Check `chef.config.ts` in the project root — the project administrator has restricted allowed values. Contact the person responsible for the project configuration.

### CF2002 — Invalid Config Value {#CF2002}

A value in `bundle.config` has an incorrect type or format.

**How to fix:**

Refer to the [bundle.config documentation](/en/config/bundle-config). Common mistakes:
- `output` — string instead of object
- `concat` — wrong structure (expected `{ js: [...], css: [...] }`)
- `targets` — number instead of string

### CF2003 — Playwright Config Not Found {#CF2003}

`playwright.config.ts` was not found in the project.

**How to fix:**

Initialize the test environment:

```bash
chef init tests
```

See the [Testing](/en/guide/testing) section for details.

### CF2004 — Entry Point Not Set {#CF2004}

The `input` parameter is missing from `bundle.config`.

**How to fix:**

Add `input` to `bundle.config`:

```ts
export default {
  input: 'src/index.ts',
  output: 'dist/index.bundle.js',
};
```

## CF3xxx — Testing {#test}

### CF3001 — Unknown Browser Type {#CF3001}

An unsupported browser was specified in the `--project` option.

**How to fix:**

Available browsers: `chromium`, `firefox`, `webkit`.

```bash
chef test main.core --project chromium firefox
```

### CF3002 — No E2E Tests Found {#CF3002}

No E2E test files were found in the extension.

**How to fix:**

Create test files in the `test/e2e/` directory of the extension. Files must match the `*.test.ts` or `*.spec.ts` pattern.

### CF3003 — Playwright Error {#CF3003}

Playwright exited with an error when running tests.

**How to fix:**

- Make sure Playwright is installed (`npx playwright install`)
- Check the configuration in `playwright.config.ts`
- Run tests with `--headed` for visual debugging:

```bash
chef test main.core --headed
```

## CF5xxx — Environment {#environment}

### CF5001 — Directory Outside Project Root {#CF5001}

The specified directory is outside the project root.

**How to fix:**

Make sure you're running Chef from within the project directory or specifying a path inside the project:

```bash
cd /path/to/project
chef build ui.buttons
```

## CF9xxx — Internal Errors {#internal}

Errors with `CF9xxx` codes indicate internal Chef problems. They are not caused by your code.

### CF9001 — Package Read Error {#CF9001}

Failed to read or parse extension metadata.

### CF9002 — Uncaught Exception {#CF9002}

Unhandled error during task execution.

### CF9003 — File Conversion Failed {#CF9003}

Failed to convert a file during Flow → TypeScript migration.

### CF9004 — Alias Generation Error {#CF9004}

Failed to generate TypeScript aliases during `chef init build`.

### CF9005 — Unexpected Build Error {#CF9005}

Unexpected error during the build process.

---

**If you get a CF9xxx error** — this is a Chef bug. Please [create an issue](https://github.com/bitrix-tools/chef/issues) with the full error text and reproduction steps.
