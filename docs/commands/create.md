# chef create

Scaffold a new Bitrix extension with the standard file structure.

```bash
chef create <name> [options]
```

## Arguments

| Argument | Description |
|----------|-------------|
| `name` | Extension name (e.g. `my.extension`) |

## Options

| Option | Description |
|--------|-------------|
| `-p, --path [path]` | Create extension in specific directory |
| `-t, --tech [tech]` | Technology: `ts` (default) or `js` |
| `-f, --force` | Overwrite existing directory without asking |

## Examples

```bash
chef create my.extension                          # Create TypeScript extension
chef create my.extension --tech js                # Create JavaScript extension
chef create my.extension -p ./local/js/vendor     # Create in specific directory
chef create my.extension -f                       # Overwrite without confirmation
```

## Generated files

```
my.extension/
├── bundle.config.ts
├── config.php
└── src/
    └── my.extension.ts
```