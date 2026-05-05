# CLI `--json`

Every CLI command supports the global `--json` flag — it suppresses normal human-readable output and prints JSON to stdout. The format matches the [JS API](./response-format) exactly.

```bash
chef build main.core --json
chef lint 'ui.*' --json
chef test main.core --json --reporter=teamcity   # see below
chef typecheck main.core --json
chef diag top-used --limit 10 --json
chef diag circular-deps --json
```

## When to use it

- You already have a shell pipeline — adding `--json` is easier than rewriting it in Node.js.
- Need to feed the result into another tool (e.g. `jq`, a dashboard, a Slack notifier).
- Want to diff results between runs — JSON is convenient to diff.

## Supported commands

| Command                          | `--json`                                            |
|----------------------------------|-----------------------------------------------------|
| `chef build`                     | ✓                                                   |
| `chef lint`                      | ✓                                                   |
| `chef test`                      | ✓                                                   |
| `chef typecheck`                 | ✓                                                   |
| `chef diag top-used`             | ✓                                                   |
| `chef diag top-deps`             | ✓                                                   |
| `chef diag top-bundle-size`      | ✓                                                   |
| `chef diag unused-deps`          | ✓                                                   |
| `chef diag circular-deps`        | ✓                                                   |
| `chef diag circular-imports`     | ✓                                                   |
| Other `diag` subcommands         | not supported yet, will be added on demand          |
| `chef create`, `init`, `aliases` | not relevant for CI/CD                              |

## Exit codes

- `0` — `ok: true`
- `1` — `ok: false`
- `2` — incompatible flags (see below)

## Incompatible flags

`--watch` is incompatible with `--json` — watch mode emits continuous output, which is incompatible with a single JSON document.

```bash
$ chef build main.core --watch --json
{ "ok": false, "command": "build", "error": { "code": "CF2001", "message": "--watch is not supported with --json" } }
$ echo $?
2
```

## What lands on stdout

In `--json` mode stdout is **only JSON**. Any human-readable messages (greetings, progress bars, tables) are suppressed so the output can be piped directly into a parser. If you ever see something else in there — that's a bug, please file an issue.

Stderr stays free for unexpected Node.js crashes, but in normal operation it stays silent too.

## Examples

### Simple pipe to jq

```bash
chef diag top-bundle-size --limit 5 --json | jq '.data[] | {name, total}'
```

### Fail the pipeline on error

```bash
chef build 'ui.*' --json | jq -e '.ok' > /dev/null \
  || { echo 'Build failed'; exit 1; }
```

### Extract names of failed extensions

```bash
chef lint 'ui.*' --json \
  | jq -r '.extensions[] | select(.ok == false) | .name'
```

### Get the size of a specific bundle

```bash
chef build main.core --json | jq '.extensions[0].details.bundles[0].size'
```

### Heaviest deps for a single extension

This is JS-API only (`pkg.getHeaviestDependencies`). For shell scenarios, write a thin script:

```ts
// scripts/heaviest.ts
import { chef } from '@bitrix/chef';

const pkg = await chef.getPackage(process.argv[2]);
if (!pkg)
{
  console.error(`Extension ${process.argv[2]} not found`);
  process.exit(1);
}

console.log(JSON.stringify(await pkg.getHeaviestDependencies({ limit: 10 }), null, 2));
```

```bash
npx tsx scripts/heaviest.ts main.core | jq '.[] | {name, total}'
```

## JSON alternative: TeamCity reporter

For tests there is a separate mode — `chef test --reporter=teamcity` — that emits TeamCity service messages instead of JSON. Used in TeamCity CI. This is **not** part of the API format, see the [Commands page](../commands).
