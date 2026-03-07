# Migration from @bitrix/cli

This guide helps you migrate from `@bitrix/cli` to `@bitrix/chef`. Chef is a rewritten tool with the same purpose: building, testing, and maintaining Bitrix JS extensions.

## Why migrate

- **Speed** — significantly faster builds thanks to an optimized pipeline
- **TypeScript** — native TypeScript support out of the box, including configs (`bundle.config.ts`)
- **Modern targets** — defaults to `baseline widely available` instead of `IE >= 11`
- **E2E tests** — Playwright support for end-to-end testing
- **New commands** — `chef stat` for dependency analysis, `chef flow-to-ts` for Flow migration
- **Node.js 22+** — leverages modern platform features

## Installation

```bash
# Remove old CLI
npm uninstall -g @bitrix/cli

# Install Chef
npm install -g @bitrix/chef
```

After installation, the `chef` command is available globally. The old `bitrix` command is no longer used.

## Commands

| @bitrix/cli | @bitrix/chef | Notes |
|-------------|-------------|-------|
| `bitrix build` | `chef build` | Fully compatible |
| `bitrix build -w` | `chef build -w` | Watch mode |
| `bitrix build -p ./path` | `chef build -p ./path` | Build by path |
| `bitrix test` | `chef test` | Fully reworked (Playwright) |
| `bitrix create name` | `chef create name` | Fully compatible |
| — | `chef init` | **New.** Project initialization |
| — | `chef stat` | **New.** Dependency and size analysis |
| — | `chef flow-to-ts` | **New.** Flow.js → TypeScript migration |
| — | `chef test unit` | **New.** Run unit tests only |
| — | `chef test e2e` | **New.** Run e2e tests only |

### Building by name

In CLI, building only worked by path. In Chef, you can build by extension name and use glob patterns:

```bash
# Build specific extensions
chef build main.core ui.buttons

# Build by pattern
chef build ui.bbcode.*

# Build all extensions in current directory (as before)
chef build
```

## bundle.config

Configs are fully compatible — existing `bundle.config.js` files work without changes. But there are a few differences to be aware of.

### TypeScript support

Chef supports `bundle.config.ts`:

```ts
import type { BundleConfig } from '@bitrix/chef';

export default {
  input: './src/ui.buttons.ts',
  output: './dist/ui.buttons.bundle.js',
  namespace: 'BX.UI.Buttons',
} as BundleConfig;
```

The `BundleConfig` type provides autocompletion and type checking in the IDE.

### browserslist → targets

The `browserslist` option has been renamed to `targets`:

```ts
// Before (@bitrix/cli)
export default {
  browserslist: true,        // read from .browserslistrc
  browserslist: ['last 2 versions'],  // or directly
};

// After (@bitrix/chef)
export default {
  targets: ['last 2 versions'],  // if you need custom targets
};
```

**Key difference:** in Chef, you don't need to specify `browserslist: true`. Chef automatically looks for `.browserslistrc` up the directory tree. If no file is found, it defaults to `baseline widely available`.

The old `browserslist` option continues to work for backwards compatibility.

### plugins → plugins, resolveNodeModules, babel

The `plugins` format has changed. Previously it was an object with `resolve`, `babel`, and `custom` fields. Now `plugins` is an array of Rollup plugins, and `resolve` and `babel` have been extracted to separate options:

```ts
// Before (@bitrix/cli)
export default {
  plugins: {
    resolve: true,
    babel: false,
    custom: [myPlugin()],
  },
};

// After (@bitrix/chef)
export default {
  resolveNodeModules: true,
  babel: false,
  plugins: [myPlugin()],
};
```

The old object format continues to work for backwards compatibility — Chef automatically converts it to the new format.

### New: rebuild

Chef supports the `rebuild` option — automatic rebuilding of dependent extensions:

```ts
export default {
  rebuild: ['ui.bbcode.encoder', 'ui.bbcode.formatter'],
};
```

`rebuild` accepts an array of extension names. Chef will rebuild them automatically after building the current extension and show the status of each in the report.

### Default browser targets

| | @bitrix/cli | @bitrix/chef |
|---|-------------|--------------|
| **Default** | `IE >= 11, last 4 version` | `baseline widely available` |
| **Resolution** | `browserslist` in config | `.browserslistrc` file → fallback to default |

If your project needs to support older browsers, specify targets explicitly:

```ts
export default {
  targets: ['IE >= 11', 'last 4 version'],
};
```

Or create a `.browserslistrc` in the project root:

```
IE >= 11
last 4 version
```

## Testing

Testing in Chef has been completely reworked.

| | @bitrix/cli | @bitrix/chef |
|---|-------------|--------------|
| **Framework** | Mocha + JSDom | Playwright + Mocha |
| **Environment** | JSDom (emulation) | Real browsers (Chromium, Firefox, WebKit) |
| **E2E tests** | — | Playwright Test |
| **TypeScript** | — | Native support |
| **Debug** | — | `--debug` with DevTools |

### Initialization

```bash
chef init tests
```

Creates `playwright.config.ts` and `.env.test` in the project root.

### Install browsers

```bash
npx playwright install
```

### Test structure

Tests moved from `test/` to subdirectories:

```
# Before (@bitrix/cli)
my.extension/
└── test/
    └── example.test.js

# After (@bitrix/chef)
my.extension/
└── test/
    ├── unit/
    │   └── example.test.ts
    └── e2e/
        └── example.spec.ts
```

### Test syntax

Unit tests still use Mocha + Chai, the syntax hasn't changed:

```ts
import { describe, it } from 'mocha';
import { assert } from 'chai';

describe('MyFeature', () => {
  it('should work', () => {
    assert.ok(true);
  });
});
```

## TypeScript

Chef has native TypeScript support. To set up the project:

```bash
chef init build
```

This creates `tsconfig.json`, `aliases.tsconfig.json`, and `.browserslistrc`.

After that, you can write extensions in TypeScript and import by name:

```ts
import { Loc, Tag } from 'main.core';
import { Button } from 'ui.buttons';
```

See [TypeScript](/en/guide/typescript) for details.

## Step-by-step migration plan

1. **Install Chef**
   ```bash
   npm uninstall -g @bitrix/cli
   npm install -g @bitrix/chef
   ```

2. **Initialize the project**
   ```bash
   cd /path/to/project
   chef init
   ```

3. **Verify the build**
   ```bash
   chef build my.extension
   ```
   Existing `bundle.config.js` files work without changes.

4. **Update configs** (optional)
   - Rename `bundle.config.js` → `bundle.config.ts`
   - Replace `browserslist` → `targets`
   - Replace `plugins: { resolve, babel, custom }` → `resolveNodeModules`, `babel`, `plugins: [...]`

5. **Set up tests** (if used)
   ```bash
   chef init tests
   npx playwright install
   ```
   Move tests to `test/unit/`.

6. **Update CI/CD**
   - Replace `bitrix build` → `chef build`
   - Replace `bitrix test` → `chef test`
   - Ensure Node.js >= 22
