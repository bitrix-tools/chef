# chef build

Build extensions using Rollup with Babel and PostCSS.

```bash
chef build [extensions...] [options]
```

## Arguments

| Argument | Description |
|----------|-------------|
| `extensions` | Extension names or glob patterns (e.g. `main.core`, `ui.bbcode.*`) |

## Options

| Option | Description |
|--------|-------------|
| `-w, --watch` | Watch for changes and rebuild |
| `-p, --path [path]` | Build specific directory |
| `-v, --verbose` | Show detailed build logs |
| `-f, --force` | Skip safety checks and force rebuild |

## Examples

```bash
chef build main.core ui.buttons    # Build specific extensions
chef build main.core -w            # Build and watch for changes
chef build ui.bbcode.*             # Build extensions matching pattern
chef build ui.* -w                 # Build all ui.* extensions with watch
chef build                         # Build all extensions in current directory
```

> **Note:** In zsh, escape glob patterns to prevent shell expansion: `chef build ui.\*`