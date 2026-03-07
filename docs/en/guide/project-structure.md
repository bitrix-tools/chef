# JS Extension

A JS extension is the primary unit of frontend code in Bitrix. It is a standalone module with source files, build configuration and a PHP manifest.

## Creating

Create a new extension with `chef create`:

```bash
chef create ui.buttons                # TypeScript (default)
chef create ui.buttons --tech js      # JavaScript
```

Chef resolves the extension name to a path and creates the directory in `local/js/`:

```
ui.buttons  →  local/js/ui/buttons/
my.feature  →  local/js/my/feature/
crm.kanban  →  local/js/crm/kanban/
```

All necessary files will be created:

```
local/js/ui/buttons/
├── bundle.config.ts
├── config.php
├── src/
│   └── ui.buttons.ts
└── test/
    ├── unit/
    │   └── ui.buttons.test.ts
    └── e2e/
        └── ui.buttons.spec.ts
```

If the project has a `tsconfig.json`, Chef will automatically create a TypeScript extension. If `tsconfig.json` is absent — JavaScript. You can explicitly specify via `--tech ts` or `--tech js`.

## File Structure

Full extension structure with tests:

```
local/js/ui/buttons/
├── bundle.config.ts       # Build configuration
├── config.php             # PHP manifest (dependencies, assets)
├── src/
│   └── ui.buttons.ts      # Entry point
├── dist/
│   ├── ui.buttons.bundle.js   # Compiled JS (generated on build)
│   └── ui.buttons.bundle.css  # Compiled CSS (generated on build)
└── test/
    ├── unit/              # Unit tests (Mocha + Chai)
    │   └── ui.buttons.test.ts
    └── e2e/               # E2E tests (Playwright)
        └── ui.buttons.spec.ts
```

The extension name is derived from its path: `local/js/ui/buttons/` → `ui.buttons`.

## bundle.config.ts

Build configuration for the extension. Created in the root of the extension directory.

```ts
import type { BundleConfig } from '@bitrix/chef';

export default {
  input: './src/ui.buttons.ts',
  output: './dist/ui.buttons.bundle.js',
  namespace: 'BX.UI.Buttons',
} as BundleConfig;
```

> JavaScript config is also supported: `bundle.config.js`.

### Options

| Option | Type | Description |
|--------|------|-------------|
| `input` | `string` | Entry point |
| `output` | `string \| { js, css }` | Output bundle path. String — JS only, object — JS and CSS separately |
| `namespace` | `string` | Global namespace for exports (default: `window`) |
| `targets` | `string \| string[]` | Target browsers for Babel and PostCSS |
| `sourceMaps` | `boolean` | Generate source maps |
| `minification` | `boolean \| object` | Minification via Terser |
| `treeshake` | `boolean` | Remove unused code (default: `true`) |
| `adjustConfigPhp` | `boolean` | Auto-update `rel` in `config.php` (default: `true`) |
| `protected` | `boolean` | Skip extension during mass scanning |
| `concat` | `{ js?, css? }` | Concatenate additional files into the bundle |
| `cssImages` | `object` | Image handling in CSS (`inline` or `copy`) |
| `plugins.babel` | `boolean \| object` | Babel plugin settings |
| `plugins.custom` | `array` | Additional Rollup plugins |
| `tests.localization` | `object` | Localization settings for tests |
| `rebuild` | `string[]` | Extensions to rebuild after building the current one |

### Splitting JS and CSS

By default, CSS is included in the JS bundle. To output CSS as a separate file:

```ts
export default {
  input: './src/ui.buttons.ts',
  output: {
    js: './dist/ui.buttons.bundle.js',
    css: './dist/ui.buttons.bundle.css',
  },
  namespace: 'BX.UI.Buttons',
} as BundleConfig;
```

## config.php

PHP manifest of the extension. Contains paths to compiled files and the list of dependencies.

```php
<?php
if (!defined('B_PROLOG_INCLUDED') || B_PROLOG_INCLUDED !== true)
{
    die();
}

return [
    'js'  => './dist/ui.buttons.bundle.js',
    'css' => './dist/ui.buttons.bundle.css',
    'rel' => [
        'main.core',
    ],
    'skip_core' => false,
];
```

Chef automatically updates the `rel` array on build — it analyzes imports and writes dependencies. No need to update `rel` manually.

## Loading on a Page

```php
\Bitrix\Main\UI\Extension::load('ui.buttons');
```

After loading, all extension exports are available via the namespace:

```js
const button = new BX.UI.Buttons.Button({ text: 'Save' });
document.body.appendChild(button.render());
```

## Tests

### Unit Tests

Run in a real browser via Playwright. Use Mocha + Chai.

::: tip
`mocha`, `chai` and their types are included in Chef and used when running `chef test`. For IDE autocompletion and type checking, install them locally:
```bash
npm install --save-dev @types/mocha @types/chai
```
:::

```ts
// test/unit/ui.buttons.test.ts
import { it, describe } from 'mocha';
import { assert } from 'chai';

import { Button } from '../../src/ui.buttons';

describe('Button', () => {
  it('should render node', () => {
    const button = new Button({ text: 'OK' });
    assert.ok(button.render() instanceof HTMLElement);
  });
});
```

### E2E Tests

Use the Playwright Test API.

Without authentication — for public pages:

```ts
// test/e2e/ui.buttons.spec.ts
import { test, expect } from '@playwright/test';

test('button is visible on page', async ({ page }) => {
  await page.goto('/my-page');
  await expect(page.locator('.ui-btn')).toBeVisible();
});
```

With automatic authentication — import from `ui.test.e2e.auth`. Before each test, the extension will automatically open `/auth/`, fill in the login form with credentials from `.env.test` and sign in. The test receives an already authenticated page:

```ts
// test/e2e/ui.buttons.spec.ts
import { test, expect } from 'ui.test.e2e.auth';

test('button is visible on page', async ({ page }) => {
  // page is already authenticated
  await page.goto('/my-page');
  await expect(page.locator('.ui-btn')).toBeVisible();
});
```

Credentials are taken from `.env.test` in the project root:

```env
BASE_URL=http://localhost
LOGIN=admin
PASSWORD=your_password
```

Run tests:

```bash
chef test ui.buttons                    # Run all tests
chef test unit ui.buttons                        # Unit tests only
chef test unit ui.buttons ./render-button.test.ts # Specific file
chef test e2e ui.buttons                # E2E tests only
chef test ui.buttons --headed           # With visible browser
chef test ui.buttons --debug            # With DevTools and sourcemaps
```
