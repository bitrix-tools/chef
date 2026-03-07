# Features

Chef is a CLI tool for building, testing and maintaining Bitrix frontend extensions. It finds `bundle.config.ts` in the project structure and runs a [Rollup](https://rollupjs.org/) build for each discovered package.

## Build

Rollup + Babel + PostCSS under the hood. TypeScript and Vue 3 SFC out of the box. Parallel builds for up to 4 extensions at once. Watch mode with hot reload.

```bash
chef build ui.buttons              # Build an extension
chef build ui.* -w                 # Build a group + watch
chef build ui.buttons --production # Production build with minification
```

More about the build pipeline — in [How the Build Works](#how-the-build-works).

## TypeScript

Native TypeScript support — `.ts` file compilation is built into the build pipeline. Create an extension with `chef create` — and get a typed config, path aliases for all project extensions right away.

```ts
import { Loc, Tag } from 'main.core';
import { Button } from 'ui.buttons';
```

See [TypeScript](/en/guide/typescript) for details.

## Vue 3

Write Vue 3 components with TypeScript — Chef compiles templates, styles and scripts. `import 'vue'` automatically maps to `ui.vue3`. Single File Components (`.vue`) are supported out of the box.

```ts
import { BitrixVue } from 'ui.vue3';
import Counter from './components/Counter.vue';

BitrixVue.component('ui-counter', Counter);
```

See [Vue 3](/en/guide/vue) for details.

## Testing

Unit tests with Mocha + Chai run in a real browser via Playwright. E2E tests with automatic authentication.

```bash
chef test ui.buttons               # All tests
chef test unit ui.buttons           # Unit only
chef test ui.buttons --debug       # With DevTools
```

See [Testing](/en/guide/testing) for details.

## Production Build

Minification via Terser, automatic environment variable replacement (`process.env.NODE_ENV`, `import.meta.env`), source maps disabled. Standalone mode for building without external dependencies.

```bash
chef build ui.buttons --production
```

See [Production Build](/en/guide/production) for details.

## Analytics

Bundle sizes, dependency tree and duplicates — `chef stat` shows everything for one extension or a whole group.

```bash
chef stat ui.buttons
chef stat ui.*
```

## Scaffold

`chef create` creates an extension with the right structure, config, entry point and test templates.

```bash
chef create ui.buttons
```

## JS Extensions

The recommended way to organize frontend code in Bitrix is JS extensions. These are standalone modules with an entry point, build configuration and a PHP manifest.

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

See [JS Extension](/en/guide/extension) for details.

### Other Entities

Besides JS extensions, Chef can build frontend code in other Bitrix entities: components, templates and activities. However, this approach is considered deprecated — such entities do not support the dependency system.

::: warning Building deprecated entities
Components, templates and activities do not support the dependency system — they cannot be imported in code or listed as dependencies in `config.php`. All frontend code should be moved to JS extensions, leaving only initialization in other entities:

```php
\Bitrix\Main\UI\Extension::load('vendor.news-list');
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
├── bitrix/                            # System directory (read-only)
│   └── js/
│       └── main/
│           └── core/                  # System extension: main.core
│
└── local/                             # User directory (build happens here)
    ├── js/
    │   └── vendor/
    │       └── my-extension/          # JS extension: vendor.my-extension
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
If you need to modify a system extension — copy it to `local/js/` and modify it there. When loading an extension, Bitrix first looks in `local/js/`, then in `bitrix/js/`, so the local copy automatically replaces the system one.
:::

## How the Build Works

### Specifying Packages

Most Chef commands (`build`, `test`, `stat`) accept extension lists in the same way.

**One or more extensions by name:**

```bash
chef build ui.buttons
chef build ui.buttons main.core ui.icons
```

**Glob pattern** — to work with a group of extensions at once:

```bash
chef build ui.*                    # All extensions with ui. prefix
chef build ui.bbcode.*             # All extensions inside ui.bbcode
```

::: tip
In zsh, escape glob patterns to prevent the shell from expanding them:
```bash
chef build ui.\*
```
:::

**Directory scan** — without arguments, Chef scans the current directory:

```bash
cd local/js/ui
chef build                         # All extensions inside ui/
chef build -p local/js/ui          # Or specify a directory explicitly
```

### Build Pipeline

When running `chef build`, for each package:

1. **Read configuration** — parse `bundle.config.ts`
2. **Build the bundle** via Rollup:
   - [TypeScript](https://www.typescriptlang.org/) — compile `.ts` files
   - [Babel](https://babeljs.io/) — transpile to target browsers
   - [PostCSS](https://postcss.org/) — autoprefixes, SVG optimization, inline images
   - [Terser](https://terser.org/) — minification (if enabled)
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

```ts
const button = new BX.UI.Buttons.Button();
const group = new BX.UI.Buttons.ButtonGroup();
```

If `namespace` is not set, `window` is used by default — exports become global variables.

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
