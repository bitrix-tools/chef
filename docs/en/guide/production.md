# Production Build

By default Chef builds extensions in dev mode. For production builds use the `--production` flag:

```bash
chef build ui.buttons --production
```

## Mode Comparison

| | Dev (default) | Production |
|---|---|---|
| Source maps | enabled | disabled |
| Minification | disabled | enabled (Terser) |
| Vue `__file` | included | removed |
| `process.env.NODE_ENV` | `"development"` | `"production"` |

## Dev Mode

The default mode when running `chef build`. Optimized for development:

- **Source maps** — source maps are generated alongside the bundle (`.bundle.js.map`). They allow debugging TypeScript code directly in browser DevTools.
- **No minification** — code remains readable, errors are easy to locate.
- **Vue `__file`** — Vue components include the path to the source file, helping Vue Devtools display component names.

```bash
chef build ui.buttons          # dev mode
chef build ui.buttons -w       # dev + watch
```

## Production Mode

Optimized for deployment:

- **Minification** — code is compressed via [Terser](https://terser.org/). Whitespace is removed, variable names are shortened, dead code is eliminated.
- **No source maps** — source maps are not generated, reducing file size.
- **No Vue `__file`** — the source path is removed from Vue components, keeping the project structure private.

```bash
chef build ui.buttons --production
```

### Example

Dev build:

```
✔ ui.buttons
  └─ buttons.bundle.js  13.7 KB
```

Production build:

```
✔ ui.buttons
  └─ buttons.bundle.js  5.9 KB (-7.8 KB)
```

## Environment Variables

Chef automatically replaces environment variables during build, similar to [Vite](https://vite.dev/guide/env-and-mode):

| Variable | Production | Development |
|---|---|---|
| `process.env.NODE_ENV` | `"production"` | `"development"` |
| `import.meta.env.MODE` | `"production"` | `"development"` |
| `import.meta.env.PROD` | `true` | `false` |
| `import.meta.env.DEV` | `false` | `true` |

Replacement happens statically at build time. This enables tree-shaking to remove dev-only code from npm packages (Lexical, React, Vue, etc.):

```ts
// This block will be completely removed in production builds
if (process.env.NODE_ENV !== 'production') {
  console.warn('Debug info');
}
```

## Config Priority

If `sourceMaps` or `minification` are explicitly set in `bundle.config`, the config value takes priority over the build mode.

```ts
// bundle.config.ts
export default {
  input: 'src/index.ts',
  output: 'dist/index.bundle.js',
  sourceMaps: true,  // source maps will ALWAYS be generated, even with --production
};
```

| Setting | Not set in config | Set in config |
|---|---|---|
| `sourceMaps` | dev: `true`, prod: `false` | Config value |
| `minification` | dev: `false`, prod: `true` | Config value |

## Bulk Production Builds

The `--production` flag works with all extension selection methods:

```bash
chef build --production                        # All in current directory
chef build ui.* --production                   # By pattern
chef build ui.buttons main.core --production   # Specific extensions
```

## Standalone Build

By default Chef builds extensions as [IIFE](https://developer.mozilla.org/en-US/docs/Glossary/IIFE) modules: dependencies on other Bitrix extensions are declared as `external` and loaded via the dependency system (`rel` in `config.php`). In standalone mode all dependencies are inlined directly into the bundle — the output is a single self-contained file.

### When to Use

- The extension must work without the Bitrix dependency system
- You need a single file with no external dependencies (e.g. for embedding on external sites)
- You use npm packages that should be included in the bundle

### Configuration

Add `standalone: true` to `bundle.config.ts`:

```ts
export default {
  input: 'src/index.ts',
  output: 'dist/index.bundle.js',
  standalone: true,
};
```

### What Happens During Build

**Normal mode (default):**

```
src/index.ts
├── import { Loc } from 'main.core'      → external (rel in config.php)
├── import { Button } from 'ui.buttons'   → external (rel in config.php)
└── import { parse } from 'linkifyjs'     → requires resolveNodeModules: true
```

Result: the bundle contains only the extension code, Bitrix dependencies are loaded separately. npm packages are inlined when `resolveNodeModules: true` is enabled.

**Standalone mode:**

```
src/index.ts
├── import { Loc } from 'main.core'      → inlined into bundle
├── import { Button } from 'ui.buttons'   → inlined into bundle
└── import { parse } from 'linkifyjs'     → inlined from node_modules
```

Result: the bundle contains everything — Bitrix extensions and npm packages alike.

### Example

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

Normal build (with `resolveNodeModules: true`):

```
✔ vendor.link-parser
  └─ link-parser.bundle.js  48.2 KB
  rel: main.core   ← Bitrix dependencies remain external
```

Standalone build:

```
✔ vendor.link-parser
  └─ link-parser.bundle.js  93.7 KB
  rel: (empty — all dependencies inside)
```

::: info
The bundle size in standalone is noticeably larger — it includes all Bitrix dependencies (main.core, etc.) that are loaded separately in normal mode.
:::

### Mode Comparison

| | Normal | Standalone |
|---|---|---|
| Bitrix extensions | external (`rel`) | inlined |
| npm packages | inlined with `resolveNodeModules: true` | inlined automatically |
| Bundle size | minimal | maximal |
| Dependencies in `config.php` | populated automatically | empty |
| Code duplication | none | possible |

### Combining with Other Options

Standalone works with all other `bundle.config` options:

```ts
export default {
  input: 'src/index.ts',
  output: 'dist/index.bundle.js',
  standalone: true,
  namespace: 'BX.MyApp',
};
```

It is also compatible with `--production`:

```bash
chef build vendor.my-app --production
```

In this case the standalone bundle will also be minified.

### Important

- **Bundle size** — in standalone mode all dependencies end up in one file. If the extension depends on large libraries (main.core, ui.vue3), the bundle size can grow significantly.
- **Duplication** — if both a standalone bundle and regular extensions with shared dependencies are loaded on the same page, the dependency code will be loaded twice.
- **npm packages** — in normal mode npm packages are only resolved with `resolveNodeModules: true`, while Bitrix dependencies remain external. In standalone mode both npm packages and Bitrix dependencies are inlined automatically.
