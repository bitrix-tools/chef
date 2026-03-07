# Configuration

Create `bundle.config.ts` in your extension directory:

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
| `treeshake` | `boolean` | Remove unused code (default: true) |
| `plugins` | `Plugin[]` | Custom Rollup plugins |
| `resolveNodeModules` | `boolean` | Resolve dependencies from node_modules |
| `babel` | `boolean` | Enable/disable Babel transpilation (default: true) |
| `standalone` | `boolean` | Standalone build with inlined dependencies |
| `protected` | `boolean` | Protect from rebuilding |
| `rebuild` | `string[]` | Rebuild dependent extensions |
| `transformClasses` | `boolean` | Transpile classes |

## Environment variables

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

In `chef build` mode (no flags), variables are set to `development`. In `chef build --production` mode — to `production`.

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
import path from 'path';

export default {
  input: './src/index.ts',
  output: './dist/my.bundle.js',
  namespace: 'BX.My',
  plugins: [
    alias({
      entries: [
        { find: '@utils', replacement: path.resolve(__dirname, 'src/utils') },
      ],
    }),
  ],
};
```

### Multiple plugins

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

### CommonJS plugins

For plugins without ESM exports, use `require`:

```js
const myPlugin = require('rollup-plugin-my');

module.exports = {
  input: './src/index.js',
  output: './dist/my.bundle.js',
  namespace: 'BX.My',
  plugins: [
    myPlugin({ /* options */ }),
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
If you need full independence from Bitrix dependencies as well, use [standalone](/en/guide/standalone) mode.
:::

## Disabling Babel

The `babel` option allows disabling Babel transpilation. This is useful when the code is already pre-built and doesn't need Babel processing.

```ts
export default {
  input: './src/index.js',
  output: './dist/my.bundle.js',
  namespace: 'BX.My',
  babel: false,
};
```

::: warning
Without Babel, the code won't be transpiled for target browsers. Only use this option if you're sure the input code is already compatible with the required browsers.
:::

## Project config

A `chef.config.ts` (or `chef.config.js`) file in the project root lets you set rules and constraints for all extensions.

```ts
export default {
  deny: { /* block specific options */ },
  defaults: { /* default values */ },
  enforce: { /* forced values */ },
};
```

### deny — block options

Prevents the use of certain features. If an extension violates a rule, the build will fail with an error or show a warning.

```ts
export default {
  deny: {
    sfc: true,                    // block Vue SFC
    standalone: true,             // block standalone builds
    minification: true,           // block minification
    resolveNodeModules: true,     // block inlining npm dependencies
    transformClasses: true,       // block class transformation
    sourceMaps: true,             // block source maps
  },
};
```

Each rule can be `true` (error with default message) or an object with settings:

```ts
export default {
  deny: {
    sfc: {
      severity: 'error',
      message: 'SFC are not allowed, use render functions',
    },
    resolveNodeModules: {
      severity: 'warning',
      message: 'Inlining npm dependencies is not recommended',
    },
  },
};
```

| Field | Type | Description |
|-------|------|-------------|
| `severity` | `'error' \| 'warning'` | `error` — build stops, `warning` — build continues with a warning |
| `message` | `string` | Custom error or warning text |

### defaults — default values

Sets default values for all extensions. An extension can override them in its `bundle.config`.

```ts
export default {
  defaults: {
    targets: 'last 2 versions',
    sourceMaps: true,
    treeshake: true,
  },
};
```

### enforce — forced values

Forces values for all extensions. An extension **cannot** override them in `bundle.config`.

```ts
export default {
  enforce: {
    targets: 'baseline widely available',
    sourceMaps: false,
    babel: true,
  },
};
```
