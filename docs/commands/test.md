# chef test

Run unit and E2E tests using Playwright.

```bash
chef test [extensions...] [options]
```

## Arguments

| Argument | Description |
|----------|-------------|
| `extensions` | Extension names or glob patterns (e.g. `main.core`, `ui.bbcode.*`) |

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
chef test main.core ui.buttons                  # Test specific extensions
chef test ui.* --headed                         # Test with visible browser
chef test main.core -w                          # Test and watch for changes
chef test main.core --debug                     # Debug with DevTools and sourcemaps
chef test --grep "should render"                # Filter by test name
chef test main.core --project chromium firefox  # Run in specific browsers
```

## See also

- [Test Setup](/guide/test-setup) — how to initialize the test environment