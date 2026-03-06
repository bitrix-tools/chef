# Standalone Build

By default Chef builds extensions as [IIFE](https://developer.mozilla.org/en-US/docs/Glossary/IIFE) modules: dependencies on other Bitrix extensions are declared as `external` and loaded via the dependency system (`rel` in `config.php`). In standalone mode all dependencies are inlined directly into the bundle — the output is a single self-contained file.

## When to Use

- The extension must work without the Bitrix dependency system
- You need a single file with no external dependencies (e.g. for embedding on external sites)
- You use npm packages that should be included in the bundle

## Configuration

Add `standalone: true` to `bundle.config.js`:

```js
export default {
  input: 'src/index.js',
  output: 'dist/index.bundle.js',
  standalone: true,
};
```

Or in TypeScript:

```ts
// bundle.config.ts
export default {
  input: 'src/index.ts',
  output: 'dist/index.bundle.js',
  standalone: true,
};
```

## What Happens During Build

### Normal Mode (default)

```
src/index.ts
├── import { Loc } from 'main.core'      → external (rel in config.php)
├── import { Button } from 'ui.buttons'   → external (rel in config.php)
└── import { parse } from 'linkifyjs'     → ❌ error (npm package not resolved)
```

Result: the bundle contains only the extension code, dependencies are loaded separately.

### Standalone Mode

```
src/index.ts
├── import { Loc } from 'main.core'      → inlined into bundle
├── import { Button } from 'ui.buttons'   → inlined into bundle
└── import { parse } from 'linkifyjs'     → inlined from node_modules
```

Result: the bundle contains everything — Bitrix extensions and npm packages alike.

## Example

```ts
// src/index.ts
import { Loc } from 'main.core';
import { parse } from 'linkifyjs';

export class LinkParser
{
  parse(text: string): string[]
  {
    return parse(text).map(link => link.href);
  }
}
```

Normal build:

```
✔ vendor.link-parser
  └─ link-parser.bundle.js  1.2 KB
  rel: main.core
  ❌ linkifyjs — not found
```

Standalone build:

```
✔ vendor.link-parser
  └─ link-parser.bundle.js  48.5 KB
  rel: (empty — all dependencies inside)
```

## Mode Comparison

| | Normal | Standalone |
|---|---|---|
| Bitrix extensions | external (`rel`) | inlined |
| npm packages | not supported | inlined from `node_modules` |
| Bundle size | minimal | maximal |
| Dependencies in `config.php` | populated automatically | empty |
| Code duplication | none | possible |

## Combining with Other Options

Standalone works with all other `bundle.config` options:

```js
export default {
  input: 'src/index.ts',
  output: 'dist/index.bundle.js',
  standalone: true,
  namespace: 'BX.MyApp',
  browserslist: true,
};
```

It is also compatible with `--production`:

```bash
chef build vendor.my-app --production
```

In this case the standalone bundle will also be minified.

## Important

- **Bundle size** — in standalone mode all dependencies end up in one file. If the extension depends on large libraries (main.core, ui.vue3), the bundle size can grow significantly.
- **Duplication** — if both a standalone bundle and regular extensions with shared dependencies are loaded on the same page, the dependency code will be loaded twice.
- **npm packages** — in normal mode npm packages are not resolved (no `node_modules` at runtime). Standalone solves this by inlining them into the bundle.
