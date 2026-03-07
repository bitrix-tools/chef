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
| `minification` | `boolean \| object` | Terser minification options |
| `treeshake` | `boolean` | Remove unused code (default: `true`) |
| `plugins` | `Plugin[]` | Custom Rollup plugins |
| `resolveNodeModules` | `boolean` | Resolve dependencies from node_modules |
| `babel` | `boolean` | Enable/disable Babel transpilation (default: `true`) |
| `standalone` | `boolean` | Standalone build with inlined dependencies |
| `protected` | `boolean` | Protect from rebuilding |
| `rebuild` | `string[]` | Rebuild dependent extensions |
| `transformClasses` | `boolean` | Transpile classes |

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
