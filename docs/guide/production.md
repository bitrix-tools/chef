# Production Mode

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
chef build --production                        # All extensions in current directory
chef build ui.* --production                   # By pattern
chef build ui.buttons main.core --production   # Specific extensions
```
