# bundle.config

Build configuration for an extension. Create `bundle.config.ts` in your extension directory:

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

> JavaScript configuration (`bundle.config.js`) is also supported.

## Options

| Option | Type | Description |
|--------|------|-------------|
| `input` | `string` | Entry point file |
| `output` | `string \| {js, css}` | Output bundle path(s) |
| `namespace` | `string` | Global namespace for exports |
| `concat` | `{js?: string[], css?: string[]}` | Concatenate files in specified order |
| `targets` | `string \| string[]` | Browser targets for transpilation |
| `sourceMaps` | `boolean` | Generate source maps |
| `minification` | `boolean \| object` | OXC minification options |
| `treeshake` | `boolean \| string \| object` | Remove unused code. Accepts `boolean`, Rollup preset (`'smallest'`, `'safest'`, `'recommended'`), or `TreeshakingOptions` object (default: `true`) |
| `plugins` | `Plugin[]` | Custom Rollup plugins |
| `resolveNodeModules` | `boolean` | Resolve dependencies from node_modules |
| `babel` | `boolean` | Enable/disable Babel transpilation (default: `true`) |
| `standalone` | `boolean` | Standalone build with inlined dependencies |
| `protected` | `boolean` | Protect from rebuilding |
| `rebuild` | `string[]` | Rebuild dependent extensions |
| `transformClasses` | `boolean \| string[]` | Transpile classes — all (`true`) or by name |
| `emitDeclaration` | `boolean` | Generate `.d.ts` with namespace declarations (default: `true`) |
| `safeNamespaces` | `boolean` | Safe access to dependency namespaces via optional chaining |
| `baseline` | `boolean` | Check web feature availability during build (default: `true`) |

## Plugins

The `plugins` option accepts an array of Rollup-compatible plugins. Plugins are added at the end of the build chain, after Chef's built-in plugins.

### Installation

Install the plugin in your extension directory:

```bash
cd /path/to/my.extension
npm install @rollup/plugin-alias
```

### Usage

```ts
import alias from '@rollup/plugin-alias';
import { resolve } from 'node:path';

export default {
  input: './src/index.ts',
  output: './dist/my.bundle.js',
  namespace: 'BX.My',
  plugins: [
    alias({
      entries: [
        { find: '@utils', replacement: resolve(import.meta.dirname, 'src/utils') },
      ],
    }),
  ],
};
```

### Multiple Plugins

```ts
import alias from '@rollup/plugin-alias';
import replace from '@rollup/plugin-replace';

export default {
  input: './src/index.ts',
  output: './dist/my.bundle.js',
  namespace: 'BX.My',
  plugins: [
    alias({
      entries: [
        { find: '@utils', replacement: './src/utils' },
      ],
    }),
    replace({
      __VERSION__: JSON.stringify('1.0.0'),
      preventAssignment: true,
    }),
  ],
};
```

## Resolving node_modules

The `resolveNodeModules` option enables resolving dependencies from `node_modules`. By default, Chef treats all npm dependencies as external — they are not included in the bundle.

```ts
export default {
  input: './src/index.ts',
  output: './dist/my.bundle.js',
  namespace: 'BX.My',
  resolveNodeModules: true,
};
```

When enabled:
1. Install dependencies: `npm install` in the extension directory
2. Dependencies from `node_modules` will be inlined into the bundle
3. The bundle size will increase, but the extension becomes independent of npm

::: tip
If you need full independence from Bitrix dependencies as well, use [standalone](/en/guide/production#standalone-build) mode.
:::

## Disabling Babel

The `babel` option allows disabling Babel transpilation. This is useful when the code is already pre-built and doesn't need Babel processing.

```ts
export default {
  input: './src/index.ts',
  output: './dist/my.bundle.js',
  namespace: 'BX.My',
  babel: false,
};
```

::: warning
Without Babel, the code won't be transpiled for target browsers. Only use this option if you're sure the input code is already compatible with the required browsers.
:::

## Class Transpilation

The `transformClasses` option enables transpiling ES classes into functions via Babel. This is required for compatibility with legacy code that extends classes using `BX.merge`, `Object.assign`, or other patterns incompatible with native classes.

Transpile all classes:

```ts
export default {
  input: './src/index.ts',
  output: './dist/my.bundle.js',
  namespace: 'BX.My',
  transformClasses: true,
};
```

Transpile only specific classes:

```ts
export default {
  input: './src/index.ts',
  output: './dist/my.bundle.js',
  namespace: 'BX.My',
  transformClasses: ['EventEmitter', 'BaseEvent'],
};
```

When an array of names is provided, all other classes remain native. This allows transpiling only the classes that actually need backward compatibility, preserving bundle size and performance.

## Type Declarations

When building TypeScript extensions, Chef automatically generates a `.d.ts` file with ambient namespace declarations alongside the bundle. This enables IDE hints when accessing exports via namespace, e.g. `new BX.UI.Bbcode.App()`.

```
dist/
├── app.bundle.js      # Compiled bundle (comments stripped)
└── app.bundle.d.ts    # Type declarations with JSDoc
```

JSDoc comments from source files are preserved in `.d.ts` for IDE hints, but stripped from the runtime bundle to reduce size.

Declaration generation only works for TypeScript extensions with a `namespace` other than `window`.

To disable:

```ts
export default {
  input: './src/index.ts',
  output: './dist/my.bundle.js',
  namespace: 'BX.My',
  emitDeclaration: false,
};
```

## Safe Namespaces

By default, if an extension depends on another extension that hasn't been loaded on the page, including the bundle will cause a fatal error — JavaScript cannot access a non-existent namespace (e.g., `BX.Main.Core`).

The `safeNamespaces` option enables optional chaining for dependency namespace references in the IIFE wrapper. If a dependency is missing, the extension receives an empty object instead of a fatal error. This allows you to check for the dependency in code and work with it conditionally:

```js
if (BX.Main?.Core)
{
  // Dependency is loaded, safe to use
}
```

```ts
export default {
  input: './src/index.ts',
  output: './dist/my.bundle.js',
  namespace: 'BX.My.Extension',
  safeNamespaces: true,
};
```

When enabled, dependency references in the IIFE wrapper use `?.` and `??`:

```js
// Before:
})(this.BX.My.Extension = this.BX.My.Extension || {}, BX.Main.Core, BX.UI.Buttons);

// After:
})(this.BX.My.Extension = this.BX.My.Extension || {}, BX?.Main?.Core??{}, BX?.UI?.Buttons??{});
```

The extension's own namespace is not transformed — it is already safely initialized at the top of the bundle.

## Environment Variables

Chef automatically replaces environment variables during build, similar to [Vite](https://vite.dev/guide/env-and-mode):

| Variable | Production | Development |
|---|---|---|
| `process.env.NODE_ENV` | `"production"` | `"development"` |
| `import.meta.env.MODE` | `"production"` | `"development"` |
| `import.meta.env.PROD` | `true` | `false` |
| `import.meta.env.DEV` | `false` | `true` |

Replacement happens statically at build time. This enables tree-shaking to remove dev-only code from npm packages:

```ts
if (process.env.NODE_ENV !== 'production') {
  console.warn('Debug info');
}
```

In `chef build` mode (no flags), variables are set to `development`. In `chef build --production` mode — to `production`.
