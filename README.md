<p align="center">
  <img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTQwIiBoZWlnaHQ9IjE0MCIgdmlld0JveD0iMCAwIDE0MCAxNDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPCEtLSBDaGVmIGhhdCAtIHNpbmdsZSBwdWZmeSBjbG91ZCBzaGFwZSAtLT4KICA8Y2lyY2xlIGN4PSI3MCIgY3k9IjMyIiByPSIyMiIgZmlsbD0iIzI4Q0Y4RCIvPgogIDxjaXJjbGUgY3g9IjUwIiBjeT0iNDAiIHI9IjE2IiBmaWxsPSIjMjhDRjhEIi8+CiAgPGNpcmNsZSBjeD0iOTAiIGN5PSI0MCIgcj0iMTYiIGZpbGw9IiMyOENGOEQiLz4KICA8cmVjdCB4PSIzOCIgeT0iNDAiIHdpZHRoPSI2NCIgaGVpZ2h0PSIzNSIgZmlsbD0iIzI4Q0Y4RCIvPgoKICA8IS0tIEhhdCBiYW5kIC0tPgogIDxyZWN0IHg9IjM4IiB5PSI3MCIgd2lkdGg9IjY0IiBoZWlnaHQ9IjgiIHJ4PSIyIiBmaWxsPSIjMTgxODFCIi8+CgogIDwhLS0gRmFjZTogPl8gLS0+CiAgPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNDMsIDg2KSI+CiAgICA8dGV4dCB4PSIwIiB5PSIyOCIgZm9udC1mYW1pbHk9Im1vbm9zcGFjZSIgZm9udC1zaXplPSIzMiIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IiMyOENGOEQiPiZndDtfPC90ZXh0PgogIDwvZz4KPC9zdmc+" width="140" alt="Chef Logo">
</p>

<h1 align="center">Chef</h1>

<p align="center">
  <b>CLI toolkit for building, testing and maintaining Bitrix extensions</b>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@bitrix/chef"><img src="https://img.shields.io/npm/v/@bitrix/chef.svg?style=flat-square&colorA=18181B&colorB=28CF8D" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@bitrix/chef"><img src="https://img.shields.io/npm/dm/@bitrix/chef.svg?style=flat-square&colorA=18181B&colorB=28CF8D" alt="npm downloads"></a>
  <a href="https://github.com/bitrix-tools/chef/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-28CF8D?style=flat-square&colorA=18181B" alt="License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-28CF8D?style=flat-square&colorA=18181B" alt="Node.js"></a>
</p>

<br>

## Features

- **TypeScript First** — Native TypeScript support with automatic transpilation
- **Build** — Rollup-based bundler with Babel and PostCSS
- **Test** — Unit tests (Mocha + Chai) in real browsers via Playwright, and E2E tests
- **Lint** — ESLint integration for consistent code quality
- **Scaffold** — Generate new extensions with `chef create`
- **Migrate** — Convert Flow.js to TypeScript with `chef flow-to-ts`
- **Analyze** — Bundle statistics and dependency tree visualization

<br>

## Quick Start

```bash
npm install -g @bitrix/chef
```

Initialize build environment:

```bash
chef init build
```

Create and build your first extension:

```bash
chef create my.extension
chef build my.extension
```

<br>

## Commands

| Command | Description |
|---------|-------------|
| `chef build` | Build extensions (TypeScript, Babel, PostCSS) |
| `chef test` | Run unit and E2E tests |
| `chef stat` | Analyze bundle size and dependencies |
| `chef create <name>` | Scaffold a new extension |
| `chef init` | Initialize build and test environment |
| `chef init build` | Initialize TypeScript, aliases, and browserslist |
| `chef init tests` | Initialize test environment only |
| `chef flow-to-ts` | Migrate Flow.js to TypeScript |

<br>

## Configuration

Create `bundle.config.ts` in your extension directory:

```ts
export default {
  input: './src/my.extension.ts',
  output: {
    js: './dist/my.extension.bundle.js',
    css: './dist/my.extension.bundle.css',
  },
  namespace: 'BX.MyExtension',
};
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `input` | `string` | Entry point file |
| `output` | `string \| {js, css}` | Output bundle path(s) |
| `namespace` | `string` | Global namespace for exports |
| `concat` | `{js?: string[], css?: string[]}` | Concatenate files in specified order |
| `browserslist` | `boolean \| string[]` | Browser targets for transpilation |
| `sourceMaps` | `boolean` | Generate source maps |
| `minification` | `boolean \| object` | Terser minification options |
| `treeshake` | `boolean` | Remove unused code (default: true) |

> JavaScript configuration (`bundle.config.js`) is also supported.

<br>

## Browserslist

Chef uses [browserslist](https://github.com/browserslist/browserslist) to determine target browsers for Babel transpilation and CSS autoprefixing.

### Setup

Create a `.browserslistrc` file in the project root with the recommended config:

```
baseline widely available
```

This targets browsers that have [widely available](https://web-platform-dx.github.io/web-features/) support for modern web features — a good default for most projects.

Then enable it in your `bundle.config.ts`:

```ts
export default {
  input: './src/my.extension.ts',
  output: './dist/my.extension.bundle.js',
  browserslist: true,
};
```

### How it works

When `browserslist` is set to `true`, Chef looks for `.browserslistrc` up the directory tree from the extension. If the file is not found, the setting has no effect.

You can also specify targets directly in the config instead of using a separate file:

```ts
export default {
  // ...
  browserslist: ['last 2 versions', 'not dead'],
};
```

If `browserslist` is omitted or set to `false`, the default targets are used (`IE >= 11`, `last 4 version`).

> When you scaffold an extension with `chef create`, the generated config automatically sets `browserslist: true` if a `.browserslistrc` file exists in the project.

<br>

## Project Structure

```
local/js/vendor/extension/
├── bundle.config.ts           # Build configuration
├── config.php                 # Bitrix extension config
├── src/
│   └── extension.ts           # Entry point (named after extension)
├── dist/
│   ├── extension.bundle.js    # Compiled bundle
│   └── extension.bundle.css   # Compiled styles
└── test/
    ├── unit/                  # Unit tests (Mocha + Chai)
    │   └── example.test.ts
    └── e2e/                   # E2E tests (Playwright)
        └── example.spec.ts
```

TypeScript configuration (`tsconfig.json`) is placed in the project root and shared across all extensions. Use `chef init build` to set it up.

> JavaScript extensions (`.js` entry points) are also supported.

<br>

## TypeScript Setup

Initialize build environment for your project:

```bash
chef init build
```

This command:

1. **Scans all extensions** in the project
2. **Generates `aliases.tsconfig.json`** with path aliases for every extension
3. **Creates `tsconfig.json`** with recommended settings
4. **Creates `.browserslistrc`** with recommended browser targets

After initialization, you can import extensions by name:

```ts
import { Loc, Tag } from 'main.core';
import { Button } from 'ui.buttons';
```

### Generated Configuration

**aliases.tsconfig.json** — auto-generated path mappings:

```json
{
  "compilerOptions": {
    "baseUrl": "/path/to/project",
    "types": ["./bitrix/js/ui/dev/src/ui.dev.ts"],
    "paths": {
      "main.core": ["./bitrix/js/main/core/src"],
      "ui.buttons": ["./local/js/ui/buttons/src"]
    }
  }
}
```

**tsconfig.json** — main config extending aliases:

```json
{
  "extends": "./aliases.tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "target": "ESNext",
    "moduleResolution": "bundler",
    "strict": true
  }
}
```

> If `tsconfig.json` already exists, the command will ask whether to overwrite it. You can manually add `"extends": "./aliases.tsconfig.json"` to your existing config.

<br>

## Test Setup

To run unit and E2E tests you need to initialize the test environment first:

```bash
chef init tests
```

This creates two files in the project root:

| File | Description |
|------|-------------|
| `playwright.config.ts` | Playwright config for running unit and E2E tests in browser |
| `.env.test` | Credentials for automatic authentication during tests |

### Configure `.env.test`

Fill in your local Bitrix installation credentials:

```env
BASE_URL=http://localhost
LOGIN=admin
PASSWORD=your_password
```

| Variable | Description |
|----------|-------------|
| `BASE_URL` | URL of your local Bitrix installation |
| `LOGIN` | Test user login |
| `PASSWORD` | Test user password |

> **Security:** Never commit `.env.test` to version control — it contains sensitive credentials.

### Install Playwright browsers

```bash
npx playwright install
```

### Run tests

```bash
chef test main.core                       # Test specific extension
chef test ui.* --headed                   # Run with visible browser
chef test main.core -w                    # Watch mode
chef test --grep "should render"          # Filter by test name
chef test main.core --debug               # Open browser with DevTools and sourcemaps
chef test main.core --project chromium    # Run in specific browser only
```

### Test file structure

Place tests in the extension's `test/` directory:

```
my.extension/
└── test/
    ├── unit/              # Unit tests (Mocha + Chai, run in browser)
    │   └── example.test.ts
    └── e2e/               # E2E tests (Playwright)
        └── example.spec.ts
```

Unit tests run inside a real browser via Playwright — Mocha and Chai are available globally. E2E tests use the standard Playwright Test API.

<br>

## CLI Options

### Build

```bash
chef build [extensions...] [options]

Arguments:
  extensions               Extension names or glob patterns (e.g. main.core ui.bbcode.*)

Options:
  -w, --watch              Watch for changes and rebuild
  -p, --path <path>        Build specific directory
  -v, --verbose            Show detailed build logs
  -f, --force              Skip safety checks and force rebuild

Examples:
  chef build main.core ui.buttons    # Build specific extensions
  chef build main.core -w            # Build and watch for changes
  chef build ui.bbcode.*             # Build extensions matching pattern
  chef build ui.* -w                 # Build all ui.* extensions with watch
  chef build                         # Build all extensions in current directory

Note: In zsh, escape glob patterns to prevent shell expansion: chef build ui.\*
```

### Test

```bash
chef test [extensions...] [options]

Arguments:
  extensions               Extension names or glob patterns (e.g. main.core ui.bbcode.*)

Options:
  -w, --watch              Watch for changes and rerun tests
  -p, --path <path>        Test specific directory
  --headed                 Run browser tests in headed mode
  --debug                  Open browser with DevTools and sourcemaps for debugging
  --grep <pattern>         Run only tests matching the pattern
  --project <names>        Run tests in specific browsers (chromium, firefox, webkit)

Examples:
  chef test main.core ui.buttons     # Test specific extensions
  chef test ui.* --headed            # Test with visible browser
  chef test main.core -w             # Test and watch for changes
  chef test main.core --debug        # Debug with DevTools and sourcemaps
  chef test main.core --project chromium firefox  # Run in specific browsers
```

### Stat

```bash
chef stat [extensions...] [options]

Arguments:
  extensions               Extension names or glob patterns (e.g. main.core ui.bbcode.*)

Options:
  -p, --path <path>        Analyze specific directory

Examples:
  chef stat main.core ui.buttons     # Analyze specific extensions
  chef stat ui.*                     # Analyze all ui.* extensions
```

<br>

## Requirements

- Node.js >= 22
- Bitrix project or module source directory

<br>

## License

[MIT](./LICENSE)

<br>

---

<p align="center">
  Made for Bitrix developers
</p>
