# Overview

Chef is a CLI tool for building, testing and maintaining Bitrix frontend extensions. It finds `bundle.config.js` or `bundle.config.ts` in the project structure and runs a Rollup build for each discovered package.

## JS Extensions

The recommended way to organize frontend code in Bitrix is JS extensions. These are standalone modules with an entry point, build configuration and a PHP manifest. Chef is primarily designed to work with them.

A JS extension is loaded on a page via `\Bitrix\Main\UI\Extension::load('vendor.name')`, supports a dependency system and can be imported in other extensions.

```
local/js/ui/buttons/
├── bundle.config.ts       # Build configuration
├── config.php             # PHP manifest (dependencies, assets)
├── src/
│   └── buttons.ts         # Entry point
├── dist/
│   ├── buttons.bundle.js  # Compiled JS
│   └── buttons.bundle.css # Compiled styles
└── test/
    ├── unit/              # Unit tests (Mocha + Chai)
    │   └── buttons.test.ts
    └── e2e/               # E2E tests (Playwright)
        └── buttons.spec.ts
```

The extension name is derived from its path: `local/js/ui/buttons/` → `ui.buttons`.

Only JS extensions support the dependency system — they can be imported in other extensions and listed as dependencies in `config.php`.

Create a new extension with:

```bash
chef create ui.buttons              # TypeScript (default)
chef create ui.buttons --tech js    # JavaScript
```

## Other Entities

Besides JS extensions, Chef can build frontend code in other Bitrix entities: components, templates and activities. However, this approach is considered deprecated — such entities do not support the dependency system, and in upcoming versions their build will trigger a console warning.

### Components <Badge type="warning" text="deprecated" />

Visual page blocks with server and client logic.

```
local/components/vendor/news.list/
├── bundle.config.ts
├── class.php
├── src/
│   └── index.ts
└── dist/
    └── index.bundle.js
```

### Component Templates <Badge type="warning" text="deprecated" />

Responsible for rendering component data. Nested inside the component directory.

```
local/components/vendor/news.list/templates/custom/
├── bundle.config.ts
├── template.php
├── src/
│   └── index.ts
└── dist/
    └── index.bundle.js
```

### Site Templates <Badge type="warning" text="deprecated" />

Define the overall design and layout of pages.

```
local/templates/my_template/
├── bundle.config.ts
├── header.php
├── footer.php
├── src/
│   └── index.ts
└── dist/
    └── index.bundle.js
```

### Components in Site Templates <Badge type="warning" text="deprecated" />

Overridden component templates inside a site template.

```
local/templates/my_template/components/bitrix/news.list/custom/
├── bundle.config.ts
├── template.php
├── src/
│   └── index.ts
└── dist/
    └── index.bundle.js
```

### Activities (Business Processes) <Badge type="warning" text="deprecated" />

Actions for the business process designer. May contain frontend for configuring parameters.

```
local/activities/custom/my_activity/
├── bundle.config.ts
├── src/
│   └── index.ts
└── dist/
    └── index.bundle.js
```

::: warning Building deprecated entities
In upcoming updates, building components, templates and activities will trigger a console warning.

Components, templates and activities do not support the dependency system — they cannot be imported in code or listed as dependencies in `config.php`. Therefore, all frontend code should be moved to JS extensions, leaving only initialization in other entities:

```php
// component template.php — only extension initialization
\Bitrix\Main\UI\Extension::load('vendor.news-list');
```

```html
<script>
    BX.ready(() => {
        BX.Vendor.NewsList.init(<?= Json::encode($arResult) ?>);
    });
</script>
```
:::

## Project Structure

A standard Bitrix installation with `bitrix/` and `local/` directories. Root-level configs are created by `chef init` commands:

```
project/
├── .browserslistrc                    # Target browsers (chef init build)
├── tsconfig.json                      # TypeScript config (chef init build)
├── aliases.tsconfig.json              # Extension path aliases (chef init build)
├── playwright.config.ts               # Playwright config (chef init tests)
├── .env.test                          # Test credentials (chef init tests)
│
├── bitrix/                            # ⛔ System directory (read-only)
│   └── js/
│       └── main/
│           └── core/                  # System extension: main.core
│
└── local/                             # ✅ User directory (build happens here)
    ├── js/
    │   └── vendor/
    │       └── my-extension/          # JS extension: vendor.my-extension
    ├── components/
    │   └── vendor/
    │       └── news.list/             # Component
    │           └── templates/
    │               └── custom/        # Component template
    ├── templates/
    │   └── my_template/               # Site template
    │       └── components/
    │           └── bitrix/
    │               └── menu/
    │                   └── horizontal/ # Component in site template
    ├── activities/
    │   └── custom/
    │       └── my_activity/           # Activity
    └── modules/
        └── vendor.module/
            └── install/
                └── js/
                    └── vendor/
                        └── feature/   # Extension inside a module
```

::: danger bitrix/ directory — read only
`bitrix/` contains the platform core and is overwritten on updates. Chef uses `bitrix/js/` only for reading — to resolve dependencies and determine namespaces of core extensions. Builds only run in `local/`.
:::

::: tip Overriding system extensions
If you need to modify a system extension — copy it to `local/js/` and modify it there. When loading an extension, Bitrix first looks in `local/js/`, then in `bitrix/js/`, so the local copy automatically replaces the system one. Chef works the same way: `local/js/` is checked first when resolving dependencies.
:::

### Initializing configs

```bash
chef init build    # Creates tsconfig.json, aliases.tsconfig.json, .browserslistrc
chef init tests    # Creates playwright.config.ts, .env.test
```

`chef init build` scans all extensions and generates `aliases.tsconfig.json` with paths so that imports like `import { Tag } from 'main.core'` work in code. See [TypeScript](/guide/typescript) for details.

`chef init tests` creates a Playwright config and credentials file for automatic authentication during testing. See [Test Setup](/guide/test-setup) for details.

## How the Build Works

### Specifying Packages

Most Chef commands (`build`, `test`, `stat`) accept extension lists in the same way.

**One or more extensions by name:**

```bash
chef build ui.buttons
chef build ui.buttons main.core ui.icons    # Multiple, space-separated
```

**Glob pattern** — to work with a group of extensions at once:

```bash
chef build ui.*                    # All extensions with ui. prefix
chef build ui.bbcode.*             # All extensions inside ui.bbcode
chef build main.core ui.* crm.*   # Mix names and patterns
```

::: tip
In zsh, escape glob patterns to prevent the shell from expanding them:
```bash
chef build ui.\*
```
:::

**Directory scan** — without arguments, Chef scans the current directory and builds all found extensions:

```bash
cd local/js/ui
chef build               # All extensions inside ui/

chef build -p local/js/ui    # Or specify a directory explicitly via --path
```

The same rules apply to `chef test` and `chef stat`:

```bash
chef test ui.*               # Run tests for all ui.* extensions
chef stat ui.* main.core     # Stats for a group of extensions
```

### Build Pipeline

When running `chef build`, for each package:

1. **Read configuration** — parse `bundle.config.ts`
2. **Build the bundle** via Rollup:
   - **TypeScript** — compile `.ts` files
   - **Babel** — transpile to target browsers
   - **PostCSS** — autoprefixes, SVG optimization, inline images
   - **Terser** — minification (if enabled)
3. **Update `config.php`** — analyze imports and write dependencies to `rel`
4. **Source maps** — generate source maps (if enabled)

Up to 4 packages are built in parallel.

### Namespaces

Each extension declares a global namespace in `bundle.config.ts`:

```ts
export default {
  input: './src/buttons.ts',
  output: './dist/buttons.bundle.js',
  namespace: 'BX.UI.Buttons',
};
```

After building, everything exported from the entry point becomes accessible via this namespace:

```ts
// src/buttons.ts
export class Button { /* ... */ }
export class ButtonGroup { /* ... */ }
```

In the browser after build:

```js
const button = new BX.UI.Buttons.Button();
const group = new BX.UI.Buttons.ButtonGroup();
```

If `namespace` is not set, `window` is used by default — exports become global variables.

#### Bundle anatomy

The built bundle is an IIFE that extends the namespace object. Here is a simplified example for the `ui.buttons` extension with a dependency on `main.core`:

```js
/* eslint-disable */
this.BX = this.BX || {};
this.BX.UI = this.BX.UI || {};
(function (exports, main_core) {
    'use strict';

    class Button {
        constructor(options) {
            this.node = main_core.Tag.render`<button>${options.text}</button>`;
        }
        render() {
            return this.node;
        }
    }

    exports.Button = Button;

}((this.BX.UI.Buttons = this.BX.UI.Buttons || {}), BX));
```

- `this.BX.UI.Buttons` — the namespace object, all exports go into it
- `BX` — the global namespace of the `main.core` dependency, passed as an IIFE argument
- `import { Tag } from 'main.core'` in source becomes `main_core.Tag` in the bundle

### Dependencies

Standard ES imports are used in source code:

```ts
import { Loc, Tag } from 'main.core';
import { Button } from 'ui.buttons';
```

During build, Chef analyzes imports, replaces them with global namespace references and updates `config.php`:

```php
return [
    'js'  => ['./dist/my.extension.bundle.js'],
    'css' => ['./dist/my.extension.bundle.css'],
    'rel' => [
        'main.core',
        'ui.buttons',
    ],
];
```

If the extension does not depend on `main.core`, Chef automatically adds `'skip_core' => true` to avoid loading the core unnecessarily.

### Protected Extensions

An extension can be marked as protected in `bundle.config.ts`:

```ts
export default {
  input: './src/index.ts',
  output: './dist/index.bundle.js',
  protected: true,
};
```

Protected extensions are skipped during scanning (`chef build` without arguments or with a glob pattern), but are built when explicitly named.
