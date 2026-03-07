# chef test

Run unit and E2E tests using Playwright.

```bash
chef test [extensions...] [options]        # unit + e2e
chef test unit [extensions...] [file?]     # unit only
chef test e2e [extensions...] [file?]      # e2e only
```

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `chef test` | Run unit and e2e tests |
| `chef test unit` | Run only unit tests |
| `chef test e2e` | Run only e2e tests |

## Arguments

| Argument | Description |
|----------|-------------|
| `extensions` | Extension names or glob patterns (e.g. `main.core`, `ui.bbcode.*`) |
| `file` | `unit`/`e2e` only — test file name to run (e.g. `dom.test.ts`) |

## Options

| Option | Description |
|--------|-------------|
| `-w, --watch` | Watch for changes and rerun tests |
| `-p, --path [path]` | Test specific directory |
| `--headed` | Run browser tests in headed mode |
| `--debug` | Open browser with DevTools and sourcemaps for debugging |
| `--grep <pattern>` | Run only tests matching the pattern |
| `--project <names>` | Run tests in specific browsers (chromium, firefox, webkit) |

## Examples

```bash
# Run all tests
chef test main.core ui.buttons

# Unit tests only
chef test unit main.core
chef test unit main.core ./render-tag.test.ts        # Specific file

# E2E tests only
chef test e2e ui.buttons
chef test e2e ui.buttons ./render-buttons.spec.ts    # Specific file

# Options
chef test ui.* --headed                         # With visible browser
chef test main.core -w                          # Watch mode
chef test main.core --debug                     # Debug with DevTools and sourcemaps
chef test --grep "should render"                # Filter by test name
chef test main.core --project chromium firefox  # Run in specific browsers
```

## See also

- [Test Setup](/en/guide/test-setup) — how to initialize the test environment
