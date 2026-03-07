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