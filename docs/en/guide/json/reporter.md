# CLI `--reporter`

`chef` commands accept the `--reporter <name>` option to switch output format. Available reporters:

- `default` — human-readable output (used when nothing is passed).
- `json` — structured JSON to stdout. Format is documented in [Response format](./response-format).
- `teamcity` — TeamCity service messages, only for `chef test`.

```bash
chef build main.core --reporter json
chef lint 'ui.*' --reporter json
chef test main.core --reporter json
chef typecheck main.core --reporter json
chef diag top-used --limit 10 --reporter json
chef diag circular-deps --reporter json
```

## When to use `json`

- You already have a shell-based pipeline — adding `--reporter json` is easier than parsing human output.
- You need to feed results into another tool (`jq`, dashboard, Slack notifier).
- You want to diff results between runs — JSON diffs cleanly.

## Supported commands

| Command                          | `--reporter json` |
|----------------------------------|-------------------|
| `chef build`                     | ✓                 |
| `chef lint`                      | ✓                 |
| `chef test`                      | ✓                 |
| `chef typecheck`                 | ✓                 |
| `chef diag top-used`             | ✓                 |
| `chef diag top-deps`             | ✓                 |
| `chef diag top-deps-tree`        | ✓                 |
| `chef diag top-bundle-size`      | ✓                 |
| `chef diag top-total-size`       | ✓                 |
| `chef diag config`               | ✓                 |
| `chef diag unused-deps`          | ✓                 |
| `chef diag unused`               | ✓                 |
| `chef diag circular-deps`        | ✓                 |
| `chef diag circular-imports`     | ✓                 |
| `chef diag find-usages`          | ✓                 |
| `chef diag find-loaders`         | ✓                 |
| `chef diag deps-tree`            | ✓                 |
| `chef diag bundle-size`          | ✓                 |
| `chef diag baseline`             | not yet           |
| `chef create`, `init`, `aliases` | not needed in CI  |

## Exit codes

- `0` — `success: true`
- `1` — `success: false` (build/lint/test errors)
- `2` — incompatible flags (e.g. `--watch` with `--reporter json`)

## Incompatible flags

`--watch` is incompatible with `--reporter json` — watch mode implies a continuous stream, which doesn't fit a one-shot JSON document.

```bash
$ chef build main.core --watch --reporter json
{ "success": false, "command": "build", "error": { "code": "CF2001", "message": "--watch is not supported with --reporter json" }, ... }
$ echo $?
2
```

## What ends up in stdout

In `--reporter json` mode stdout contains **only JSON**. All human-readable output (greetings, progress bars, tables) is suppressed so the output can be piped straight into a parser. If you ever see anything else there, that's a bug — please file an issue.

Stderr stays free for unexpected Node.js crash dumps; under normal operation it's silent too.

## Examples

### Pipe into jq

```bash
chef diag top-bundle-size --limit 5 --reporter json | jq '.data.results[] | {name, total}'
```

### Fail the pipeline on errors

```bash
chef build 'ui.*' --reporter json | jq -e '.success' > /dev/null \
  || { echo 'Build failed'; exit 1; }
```

### Extract failed extension names

```bash
chef lint 'ui.*' --reporter json \
  | jq -r '.extensions[] | select(.success == false) | .name'
```

### Read a specific bundle size

```bash
chef build main.core --reporter json | jq '.extensions[0].details.bundles[0].size'
```

### List failing tests with file:line

```bash
chef test 'ui.*' --reporter json \
  | jq -r '.extensions[].errors[] | "\(.file):\(.line)  \(.message)"'
```

## Reporter `teamcity`

For `chef test` only. Instead of JSON it prints TeamCity service messages (`##teamcity[testStarted ...]`). Used in TeamCity CI.

```bash
chef test main.core --reporter teamcity
```
