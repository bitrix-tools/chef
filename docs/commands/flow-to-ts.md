# chef flow-to-ts

Migrate Flow.js typed code to TypeScript.

```bash
chef flow-to-ts [options]
```

## Options

| Option | Description |
|--------|-------------|
| `-p, --path [path]` | Migrate specific directory |
| `--rm-ts` | Remove existing `.ts` sources after migration |
| `--rm-js` | Remove original `.js` sources after migration |

## What it does

- Strips Flow type annotations
- Renames `.js` files to `.ts`
- Converts Flow syntax to TypeScript equivalents