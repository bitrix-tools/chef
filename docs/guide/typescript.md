# TypeScript

Chef supports [TypeScript](https://www.typescriptlang.org/) out of the box — `.ts` file compilation is built into the build pipeline. No additional setup is needed for building.

## Initialization

For TypeScript to work in the IDE and for correct type checking, initialize the configuration:

```bash
chef init build
```

The command creates three files in the project root:

| File | Description |
|------|-------------|
| `aliases.tsconfig.json` | Path aliases for all extensions in the project |
| `tsconfig.json` | Main TypeScript config, extends aliases |
| `.browserslistrc` | Target browsers for Babel and PostCSS |

After initialization, TypeScript extensions are created automatically:

```bash
chef create ui.buttons    # will create bundle.config.ts and src/ui.buttons.ts
```

## Configuration

### tsconfig.json

Generated with recommended settings:

```json
{
  "extends": "./aliases.tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "target": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "allowJs": true,
    "checkJs": false,
    "strict": true,
    "lib": ["ESNext", "DOM"]
  },
  "include": [
    "**/src/**/*.ts"
  ]
}
```

If `tsconfig.json` already existed, Chef will not overwrite it. Add the line manually:

```json
{
  "extends": "./aliases.tsconfig.json",
  // your settings...
}
```

### aliases.tsconfig.json

Auto-generated based on all extensions in the project:

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

This makes extension imports by name work both in the editor and during type checking:

```ts
import { Loc, Tag } from 'main.core';
import { Button } from 'ui.buttons';
```

### Updating aliases

When adding new extensions to the project, regenerate aliases:

```bash
chef init build
```

The command rescans all extensions and updates `aliases.tsconfig.json`. `tsconfig.json` is not overwritten.

## Bitrix API Types

The `ui.dev` extension provides types for the global `BX` object and other Bitrix APIs. Chef automatically includes it in `aliases.tsconfig.json` via the `types` field if the extension is found in the project.

After that, typed access is available in code:

```ts
BX.message('hello');          // type string
BX.ready(() => { /* ... */ }); // callback
```

## Writing Extensions

### Entry Point

All public classes and functions are exported from the entry point:

```ts
// src/ui.buttons.ts
export class Button {
  #node: HTMLElement;

  constructor(private options: { text: string }) {
    this.#node = document.createElement('button');
    this.#node.textContent = options.text;
  }

  render(): HTMLElement {
    return this.#node;
  }
}

export class ButtonGroup {
  #buttons: Button[] = [];

  add(button: Button): this {
    this.#buttons.push(button);
    return this;
  }
}
```

### Importing Dependencies

Other extensions are imported by name — like npm packages:

```ts
import { Tag, Loc } from 'main.core';
import { Button } from 'ui.buttons';
import { Popup } from 'main.popup';
```

During build, Chef replaces these imports with references to global dependency namespaces and writes the dependencies to `config.php`.

### bundle.config.ts

The build config is also typed — import `BundleConfig` from `@bitrix/chef`:

```ts
import type { BundleConfig } from '@bitrix/chef';

export default {
  input: './src/ui.buttons.ts',
  output: {
    js: './dist/ui.buttons.bundle.js',
    css: './dist/ui.buttons.bundle.css',
  },
  namespace: 'BX.UI.Buttons',
  browserslist: true,
} as BundleConfig;
```

## Tests in TypeScript

### Unit Tests

```ts
// test/unit/ui.buttons.test.ts
import { it, describe } from 'mocha';
import { assert } from 'chai';

import { Button } from '../../src/ui.buttons';

describe('Button', () => {
  it('should render HTMLElement', () => {
    const button = new Button({ text: 'OK' });
    assert.instanceOf(button.render(), HTMLElement);
  });

  it('should contain correct text', () => {
    const button = new Button({ text: 'Save' });
    assert.equal(button.render().textContent, 'Save');
  });
});
```

For IDE type support, install locally:

```bash
npm install --save-dev @types/mocha @types/chai
```

### E2E Tests

```ts
// test/e2e/ui.buttons.spec.ts
import { test, expect } from '@playwright/test';

test('button renders on page', async ({ page }) => {
  await page.goto('/my-page');
  await expect(page.locator('.ui-btn')).toBeVisible();
});
```

For Playwright types in the IDE:

```bash
npm install --save-dev @playwright/test
```

## Type Checking

Chef does not run `tsc --noEmit` automatically during build — it only compiles `.ts` to `.js` via Rollup. For explicit type checking, run manually:

```bash
npx tsc --noEmit
```
