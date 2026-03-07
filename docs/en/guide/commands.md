# Commands

## chef build

Build extensions with Rollup, Babel and PostCSS.

```bash
chef build [extensions...] [options]
```

| Option | Description |
|--------|-------------|
| `extensions` | Extension names or glob patterns (`main.core`, `ui.bbcode.*`) |
| `-w, --watch` | Watch for changes and rebuild |
| `-p, --path [path]` | Build a specific directory |
| `-v, --verbose` | Show detailed build logs |
| `-f, --force` | Skip safety checks and force rebuild |
| `--production` | Production mode (minification, no source maps) |

```bash
chef build main.core ui.buttons    # Build specific extensions
chef build main.core -w            # Build and watch for changes
chef build ui.bbcode.*             # Build extensions matching pattern
chef build                         # Build all in current directory
chef build ui.buttons --production # Production build
```

::: tip
In zsh, escape glob patterns to prevent shell expansion: `chef build ui.\*`
:::

## chef test

Run unit and E2E tests via Playwright.

```bash
chef test [extensions...] [options]        # unit + e2e
chef test unit [extensions...] [file?]     # unit only
chef test e2e [extensions...] [file?]      # e2e only
```

| Option | Description |
|--------|-------------|
| `extensions` | Extension names or glob patterns |
| `file` | For `unit`/`e2e` only — test file name (`dom.test.ts`) |
| `-w, --watch` | Watch for changes and rerun tests |
| `-p, --path [path]` | Test a specific directory |
| `--headed` | Run with visible browser window |
| `--debug` | Open browser with DevTools and sourcemaps |
| `--grep <pattern>` | Run only tests matching the pattern |
| `--project <names>` | Run in specific browsers (chromium, firefox, webkit) |

```bash
chef test main.core ui.buttons                    # All tests
chef test unit main.core                          # Unit only
chef test unit main.core ./render-tag.test.ts     # Specific file
chef test e2e ui.buttons                          # E2E only
chef test ui.* --headed                           # With visible browser
chef test main.core -w                            # Watch mode
chef test main.core --debug                       # Debug with DevTools
chef test --grep "should render"                  # Filter by name
chef test main.core --project chromium firefox    # Specific browsers
```

## chef stat

Analyze bundle size and dependency tree.

```bash
chef stat [extensions...] [options]
```

| Option | Description |
|--------|-------------|
| `extensions` | Extension names or glob patterns |
| `-p, --path [path]` | Analyze a specific directory |

```bash
chef stat main.core ui.buttons     # Analyze specific extensions
chef stat ui.*                     # Analyze a group
```

## chef create

Create a new Bitrix extension with standard file structure.

```bash
chef create <name> [options]
```

| Option | Description |
|--------|-------------|
| `name` | Extension name (`my.extension`) |
| `-p, --path [path]` | Create in a specific directory |
| `-t, --tech [tech]` | Technology: `ts` (default) or `js` |
| `-f, --force` | Overwrite without confirmation |

```bash
chef create my.extension                          # TypeScript extension
chef create my.extension --tech js                # JavaScript extension
chef create my.extension -p ./local/js/vendor     # In a specific directory
```

Generated files:

```
my.extension/
├── bundle.config.ts
├── config.php
└── src/
    └── my.extension.ts
```

## chef init

Initialize build and test environment.

### chef init build

Initialize TypeScript, path aliases and browserslist.

```bash
chef init build [options]
```

| Option | Description |
|--------|-------------|
| `-p, --path [path]` | Initialize in a specific directory |

The command:
1. Scans all extensions in the project
2. Generates `aliases.tsconfig.json` with path aliases for each extension
3. Creates `tsconfig.json` with recommended settings
4. Creates `.browserslistrc` with recommended browser targets

See [TypeScript](/en/guide/typescript) for details.

### chef init tests

Initialize the Playwright test environment.

```bash
chef init tests [options]
```

| Option | Description |
|--------|-------------|
| `-p, --path [path]` | Initialize in a specific directory |

Creates `playwright.config.ts` and `.env.test` in the project root.

See [Testing](/en/guide/testing) for details.

## chef flow-to-ts

Migrate Flow.js typed code to TypeScript.

```bash
chef flow-to-ts [options]
```

| Option | Description |
|--------|-------------|
| `-p, --path [path]` | Migrate a specific directory |
| `--rm-ts` | Remove existing `.ts` files after migration |
| `--rm-js` | Remove original `.js` files after migration |

What it does:
- Removes Flow type annotations
- Renames `.js` files to `.ts`
- Converts Flow syntax to TypeScript equivalents
