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
chef build ui.bbcode.*             # Build direct children
chef build im.v2.**                # Build all nested extensions
chef build                         # Build all in current directory
chef build ui.buttons --production # Production build
```

### Glob patterns

| Pattern | Description | Example |
|---------|-------------|---------|
| `*` | One level deep | `ui.bbcode.*` → `ui.bbcode.parser`, `ui.bbcode.model` |
| `**` | All levels deep | `im.v2.**` → `im.v2.const`, `im.v2.provider.service.settings` |

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
chef test ui.* --headed                           # Direct children, with visible browser
chef test im.v2.**                                # All nested extensions
chef test main.core -w                            # Watch mode
chef test main.core --debug                       # Debug with DevTools
chef test --grep "should render"                  # Filter by name
chef test main.core --project chromium firefox    # Specific browsers
```

## chef typecheck

Check TypeScript types in extensions.

```bash
chef typecheck [extensions...] [options]
```

| Option | Description |
|--------|-------------|
| `extensions` | Extension names or glob patterns |
| `-p, --path [path]` | Search for extensions starting from this directory |
| `--file <patterns...>` | Check specific files (paths relative to extension root) |
| `--exclude <patterns...>` | Exclude files from type checking (paths or glob patterns relative to extension root) |

```bash
chef typecheck main.core                           # Check a specific extension
chef typecheck ui.bbcode.*                         # Check a group of extensions
chef typecheck main.core --file src/lib/dom.ts     # Check a specific file
chef typecheck main.core --exclude 'src/legacy/**' # Exclude files from checking
chef typecheck                                     # Check all in current directory
```

::: tip
Types are checked automatically during build (`chef build`). The `chef typecheck` command is useful when you need to check types without a full build.
:::

## chef lint

Lint extensions with ESLint.

```bash
chef lint [extensions...] [options]
```

| Option | Description |
|--------|-------------|
| `extensions` | Extension names or glob patterns |
| `-p, --path [path]` | Search for and lint extensions starting from this directory |
| `--fix` | Automatically fix problems |
| `--file <patterns...>` | Lint specific files (glob patterns relative to `src/`) |
| `--exclude <patterns...>` | Exclude files from linting (glob patterns relative to extension root) |
| `--no-cache` | Disable caching (cache is enabled by default) |

```bash
chef lint main.core                        # Lint a specific extension
chef lint ui.*                             # Lint a group of extensions
chef lint main.core --fix                  # Auto-fix problems
chef lint main.core --file "*.ts"          # Lint only .ts files
chef lint main.core --exclude 'src/old/**' # Exclude files from linting
```

::: tip
`chef lint` requires an `eslint.config.{js,mjs,cjs,ts,mts,cts}` file in the project. If no config is found, linting is skipped.
:::

## chef diag

Diagnose and analyze extensions across the project.

```bash
chef diag <subcommand> [options]
```

### Subcommands

| Subcommand | Description |
|------------|-------------|
| `top-used` | Most depended-on extensions |
| `top-deps` | Extensions with the most direct dependencies |
| `top-deps-tree` | Extensions with the largest transitive dependency tree |
| `top-bundle-size` | Extensions with the largest bundles |
| `top-total-size` | Extensions with the largest total size (own code + dependencies) |
| `config` | Search extensions by `bundle.config` parameters |
| `unused-deps` | Extensions with unused dependencies |
| `circular-deps` | Check for circular dependencies |
| `circular-imports` | Check for circular imports between source files |
| `find-usages` | Find where an extension is used across JS, TS and PHP files |
| `unused` | Extensions that are never referenced anywhere |

### Common options

| Option | Description |
|--------|-------------|
| `-p, --path [path]` | Scan for extensions starting from this directory |
| `-l, --limit <n>` | Limit the number of results (default: 20) |
| `-i, --include <patterns>` | Show only extensions matching the glob pattern |
| `-x, --exclude <patterns>` | Exclude extensions matching the glob pattern |

Patterns support `*`, `**`, `?`, `[abc]` and other glob constructs. Multiple patterns via comma or by repeating the option:

```bash
--include 'ui.*'                # Only ui.* extensions
--exclude 'main.*,im.*'        # Everything except main.* and im.*
--include 'ui.*' -x 'ui.vue.*' # ui.*, but without ui.vue.*
```

### Examples

```bash
chef diag top-used                             # Most depended-on extensions
chef diag top-bundle-size --limit 10           # TOP 10 largest bundles
chef diag top-used --exclude 'main.*,im.*'     # Exclude main and im from results
chef diag circular-deps                        # All circular dependencies
chef diag circular-deps main.core              # Check a specific extension
chef diag unused-deps                          # Unused dependencies
chef diag find-usages ui.buttons               # Where ui.buttons is used
chef diag config --key namespace               # Extensions with namespace in config
chef diag config --key minification --missing  # Extensions without minification
chef diag config --key input --except          # Extensions with params other than input
chef diag unused                               # Unused extensions
```

## chef aliases

Regenerate TypeScript path aliases (`aliases.tsconfig.json`).

```bash
chef aliases [options]
```

| Option | Description |
|--------|-------------|
| `-p, --path [path]` | Project root to scan for extensions |
| `-q, --quiet` | Quiet mode — single-line output without colors |

```bash
chef aliases                       # Regenerate aliases
chef aliases -q                    # Quiet mode (for scripts and hooks)
```

Usually runs automatically via VCS hooks (see `chef init hooks`).

## chef create

Create a new Bitrix extension with standard file structure.

```bash
chef create <name> [options]
```

| Option | Description |
|--------|-------------|
| `name` | Extension name (`my.extension`) |
| `-p, --path [path]` | Create in a specific directory |
| `-t, --tech [tech]` | Technology: `ts` or `js`. Auto-detected from the environment by default |
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

### chef init hooks

Install VCS hooks to auto-update path aliases.

```bash
chef init hooks [options]
```

| Option | Description |
|--------|-------------|
| `-p, --path [path]` | Project root where hooks will be installed |

Supports Git and Mercurial. Hooks run `chef aliases --quiet` after pull, merge, checkout and rebase to keep `aliases.tsconfig.json` up to date.

## chef flow-to-ts

Migrate Flow.js typed code to TypeScript.

```bash
chef flow-to-ts [extensions...] [options]
```

| Option | Description |
|--------|-------------|
| `extensions` | Extension names or glob patterns (`main.core`, `ui.bbcode.*`) |
| `-p, --path [path]` | Migrate a specific directory |
| `--rm-ts` | Remove existing `.ts` files after migration |
| `--rm-js` | Remove original `.js` files after migration |

What it does:
- Renames `.js` files to `.ts` via `hg rename`
- Converts Flow syntax to TypeScript equivalents
- Updates `bundle.config.js` → `bundle.config.ts`

See [Flow.js → TypeScript](/en/guide/flow-to-ts) for details.
