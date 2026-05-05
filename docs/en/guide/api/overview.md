# API Overview

Chef can be used programmatically from Node.js or invoked through the CLI with machine-readable output. This is for CI/CD, automation scripts, and custom integrations.

## Two forms

**JS API** — functions and classes imported from the package:

```ts
import { chef } from '@bitrix/chef';

const result = await chef.build({ extension: 'main.core' });
```

**CLI `--json`** — a global flag for existing commands:

```bash
chef build main.core --json
```

Under the hood both forms run the same code. The results are identical — choose whichever fits your scenario.

## When to use what

- **Custom Node.js logic** — JS API. Flexibly combine calls, process results in code, get raw data through the `Package` facade.
- **Existing shell pipeline** — CLI `--json`. Get structured output, pipe into `jq` or a third-party CI service.
- **Fine-grained extension inspection** — `Package` facade. Get an extension object by name and work with it directly.

## Hello world

```ts
import { chef } from '@bitrix/chef';

const result = await chef.build({
  cwd: '/path/to/project',
  extension: 'main.core',
});

if (!result.ok)
{
  console.error(`Build failed: ${result.summary.failed} extensions had errors`);
  process.exit(1);
}
```

## Read on

- [Getting started](./getting-started)
- [Build](./build), [Lint](./lint), [Test](./test), [Type-check](./typecheck)
- [Resolve](./resolve), [Diag](./diag)
- [Extension (Package)](./package) — the main facade for fine-grained work
- [Response format](./response-format)
- [Error codes](./errors)
- [CLI `--json`](./json-cli)
