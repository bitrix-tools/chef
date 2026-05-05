# Getting started

## Installation

The API ships in the same `@bitrix/chef` package as the CLI:

```bash
npm i @bitrix/chef
```

Minimum Node.js version is 22.

## Importing

All API functions are grouped under the `chef` namespace:

```ts
import { chef } from '@bitrix/chef';

await chef.build({ extension: 'main.core' });
await chef.lint({ extension: 'ui.*' });
await chef.diag.topUsed({ limit: 10 });

const pkg = await chef.getPackage('main.core');
```

Types and constants are named exports:

```ts
import { chef, type ChefResult, type Package, CF } from '@bitrix/chef';

function logResult(result: ChefResult<unknown>) { /* ... */ }
```

## The `cwd` parameter

Every API function accepts an optional `cwd` — the directory used to locate the Bitrix project. Defaults to `process.cwd()`:

```ts
await chef.build({ extension: 'main.core' });                       // process.cwd()
await chef.build({ cwd: '/path/to/project', extension: 'main.core' });
```

If `cwd` is not inside a Bitrix project, the function returns a result with a fatal error `CF.PROJECT_ROOT_NOT_FOUND`. See [Response format](./response-format).

## Environment is a singleton

Internally chef uses an `Environment` singleton that caches the detected project root. Every API call with a different `cwd` overwrites the context. Implications:

- **One project at a time** — works perfectly.
- **Multiple projects in one process** — may race if calls overlap. If you really need to work with several projects in the same process, do it sequentially: complete one call before starting the next.

## What's next

- Basic commands: [Build](./build), [Lint](./lint), [Test](./test), [Type-check](./typecheck).
- Fine-grained extension work: [Package](./package).
- Result conventions: [Response format](./response-format).
