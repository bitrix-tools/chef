<p align="center">
  <img src=".github/assets/logo.svg" width="140" alt="Chef Logo">
</p>

<h1 align="center">Chef</h1>

<p align="center">
  <b>CLI toolkit for building, testing and maintaining Bitrix extensions</b>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@bitrix/chef"><img src="https://img.shields.io/npm/v/@bitrix/chef.svg?style=flat-square&colorA=18181B&colorB=28CF8D" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@bitrix/chef"><img src="https://img.shields.io/npm/dm/@bitrix/chef.svg?style=flat-square&colorA=18181B&colorB=28CF8D" alt="npm downloads"></a>
  <a href="https://github.com/bitrix-tools/chef/blob/main/LICENSE"><img src="https://img.shields.io/github/license/bitrix-tools/chef.svg?style=flat-square&colorA=18181B&colorB=28CF8D" alt="License"></a>
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

Initialize TypeScript environment:

```bash
chef init ts
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
| `chef init` | Initialize TypeScript and test environment |
| `chef init ts` | Initialize TypeScript only |
| `chef init tests` | Initialize test environment only |
| `chef flow-to-ts` | Migrate Flow.js to TypeScript |

<br>

## Configuration

Create `bundle.config.ts` in your extension directory:

```ts
export default {
  input: './src/index.ts',
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
| `browserslist` | `boolean \| string[]` | Browser targets for transpilation |
| `sourceMaps` | `boolean` | Generate source maps |
| `minification` | `boolean \| object` | Terser minification options |
| `treeshake` | `boolean` | Remove unused code (default: true) |

> JavaScript configuration (`bundle.config.js`) is also supported.

<br>

## Project Structure

```
local/js/vendor/extension/
├── bundle.config.ts           # Build configuration
├── config.php                 # Bitrix extension config
├── src/
│   └── index.ts               # Entry point
├── dist/
│   ├── extension.bundle.js    # Compiled bundle
│   └── extension.bundle.css   # Compiled styles
└── test/
    ├── unit/                  # Unit tests (Mocha + Chai)
    │   └── example.test.ts
    └── e2e/                   # E2E tests (Playwright)
        └── example.spec.ts
```

TypeScript configuration (`tsconfig.json`) is placed in the project root and shared across all extensions. Use `chef init ts` to set it up.

> JavaScript extensions (`.js` entry points) are also supported.

<br>

## TypeScript Setup

Initialize TypeScript environment for your project:

```bash
chef init ts
```

This command:

1. **Scans all extensions** in the project
2. **Generates `aliases.tsconfig.json`** with path aliases for every extension
3. **Creates `tsconfig.json`** with recommended settings

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

## CLI Options

### Build

```bash
chef build [options]

Options:
  -w, --watch              Watch for changes and rebuild
  -p, --path <path>        Build specific directory
  -m, --modules <names>    Build specific modules (comma-separated)
  -e, --extensions <names> Build specific extensions (comma-separated)
  -v, --verbose            Show detailed build logs
  -f, --force              Skip safety checks and force rebuild
```

### Test

```bash
chef test [options]

Options:
  -w, --watch              Watch for changes and rerun tests
  -p, --path <path>        Test specific directory
  -m, --modules <names>    Test specific modules (comma-separated)
  -e, --extensions <names> Test specific extensions (comma-separated)
  --headed                 Run browser tests in headed mode
  --debug                  Run tests in debug mode (slower, more logs)
  --grep <pattern>         Run only tests matching the pattern
  --project <names>        Run tests in specific Playwright projects
```

### Stat

```bash
chef stat [options]

Options:
  -p, --path <path>        Analyze specific directory
  -m, --modules <names>    Analyze specific modules (comma-separated)
  -e, --extensions <names> Analyze specific extensions (comma-separated)
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
