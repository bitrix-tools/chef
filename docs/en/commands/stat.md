# chef stat

Analyze bundle size and dependency tree for extensions.

```bash
chef stat [extensions...] [options]
```

## Arguments

| Argument | Description |
|----------|-------------|
| `extensions` | Extension names or glob patterns (e.g. `main.core`, `ui.bbcode.*`) |

## Options

| Option | Description |
|--------|-------------|
| `-p, --path [path]` | Analyze specific directory |

## Examples

```bash
chef stat main.core ui.buttons     # Analyze specific extensions
chef stat ui.*                     # Analyze all ui.* extensions
```