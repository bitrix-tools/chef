# Response format

The API uses **three result shapes** — one per call type. And **never throws** in bulk operations: every error ends up in the result.

## Three shapes

### `ChefResult<TDetails>` — bulk operations

Returned by `chef.build`, `chef.lint`, `chef.test`, `chef.typecheck`.

```ts
type ChefResult<TDetails> = {
  ok: boolean;                          // true iff everything succeeded
  command: string;                      // 'build' | 'lint' | ...
  extensions: ChefExtensionResult<TDetails>[];
  notFound: Array<{ name: string; code: string; reason: string }>;
  error?: ChefErrorPayload;             // fatal error for the whole operation
  summary: {
    total: number;
    passed: number;
    failed: number;
    durationMs: number;
  };
};
```

### `ChefExtensionResult<TDetails>` — per-extension result

Items in the `extensions[]` array of `ChefResult`, and the return value of `pkg.build()` / `pkg.lint()` / `pkg.test()` / `pkg.typecheck()`.

```ts
type ChefExtensionResult<TDetails> = {
  name: string;
  path: string;
  ok: boolean;
  durationMs: number;
  details?: TDetails;                   // command-specific payload
  error?: ChefErrorPayload;             // error for this specific extension
  warnings?: ChefErrorPayload[];        // non-fatal warnings
};
```

The concrete `TDetails` depends on the operation:
- `BuildDetails` — see [Build](./build)
- `LintDetails` — see [Lint](./lint)
- `TestDetails` — see [Test](./test)
- `TypecheckDetails` — see [Type-check](./typecheck)

### `ChefDataResult<TData>` — diagnostics and resolve

Returned by `chef.resolve` and every `chef.diag.*`.

```ts
type ChefDataResult<TData> = {
  ok: boolean;
  command: string;                      // 'diag.top-used', 'resolve' etc.
  data?: TData;
  error?: ChefErrorPayload;
  durationMs: number;
};
```

This shape has neither `extensions[]` nor `notFound[]` — it is just a data query.

## ChefErrorPayload

The unified error shape in the API:

```ts
type ChefErrorPayload = {
  code: string;                         // code from the CF table (e.g. 'CF1006')
  message: string;
  file?: string;
  line?: number;
  column?: number;
};
```

`code` uses the common [`CF`](./errors) table. Every error and warning — even from Rollup, ESLint, TypeScript — is normalized to one shape.

## Three error levels

### 1. Fatal — `result.error`

Environment is not ready: invalid `cwd`, project root not found, project config could not be read. The `extensions` array will be empty.

```ts
const result = await chef.build({ cwd: '/nonexistent', extension: 'main.core' });

if (result.error)
{
  console.error(`${result.error.code}: ${result.error.message}`);
  // CF5005: Working directory does not exist
}
```

### 2. Resolution — `result.notFound[]`

The given pattern matched no extensions. Not considered fatal — other patterns might still resolve.

```ts
const result = await chef.build({ extension: ['main.core', 'unknown.foo'] });

for (const missing of result.notFound)
{
  console.warn(`Not found: ${missing.name} (${missing.code})`);
}
```

### 3. Per extension — `extensions[].error`

Build/lint/test of **this particular** extension failed. The others continue running.

```ts
const result = await chef.build({ extension: 'ui.*' });

for (const ext of result.extensions)
{
  if (!ext.ok)
  {
    console.error(`✗ ${ext.name}: ${ext.error?.message}`);
  }
}
```

## Principle: never throws

Bulk API operations are **guaranteed** not to throw. Every error sits in the `result`:

```ts
// You can safely write this — no try/catch needed
const result = await chef.build({ extension: 'main.core' });

if (!result.ok)
{
  // handle
}
```

This is convenient for CI: one check, one shape, no surprises.

## Exception: Package methods

Getters and inspections on `Package` (`pkg.getDependencies()`, `pkg.findCircularImports()`, etc.) **may** throw, like ordinary JS libraries. They have no place for an `error` field, and the package is already known to exist.

```ts
const pkg = await chef.getPackage('main.core');
if (!pkg)
{
  return;
}

try
{
  const deps = await pkg.getDependencies();
}
catch (error)
{
  // rare: PHP config parser or Rollup analysis crashed on the entry point
}
```

**Actions** (`pkg.build()`, `pkg.lint()`, `pkg.test()`, `pkg.typecheck()`) — on the contrary, do not throw. They return `ChefExtensionResult` with an `error?` inside.

`chef.findPackages()` throws `ChefError(CF.OPTION_DENIED)` when both `extension` and `path` are passed — this is a clear usage error. An invalid `cwd` returns an empty array.

## When ok is exactly true

For `ChefResult`:

```ts
result.ok === !result.error
          && result.notFound.length === 0
          && result.extensions.every((ext) => ext.ok)
```

For `ChefExtensionResult`:

```ts
ext.ok === !ext.error
```

Warnings (`warnings[]`) do not affect `ok`. If a warning should fail your CI, check `warnings.length` yourself.

## Read on

- [Error codes](./errors) — which `CF` codes appear and what they mean.
- [CLI `--json`](./json-cli) — how to get the same shape from the CLI.
