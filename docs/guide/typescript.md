# TypeScript Setup

Initialize build environment for your project:

```bash
chef init build
```

This command:

1. **Scans all extensions** in the project
2. **Generates `aliases.tsconfig.json`** with path aliases for every extension
3. **Creates `tsconfig.json`** with recommended settings
4. **Creates `.browserslistrc`** with recommended browser targets

After initialization, you can import extensions by name:

```ts
import { Loc, Tag } from 'main.core';
import { Button } from 'ui.buttons';
```

## Generated Configuration

**aliases.tsconfig.json** — auto-generated path mappings:

```json
{
  "compilerOptions": {
    "baseUrl": "/path/to/project",
    "types": ["./bitrix/js/ui/dev/src/ui.dev.ts"],
    "paths": {
      "main.core": ["./bitrix/js/main/core/src"],
      "ui.buttons": ["./local/js/ui/buttons/src"]
    }
  }
}
```

**tsconfig.json** — main config extending aliases:

```json
{
  "extends": "./aliases.tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "target": "ESNext",
    "moduleResolution": "bundler",
    "strict": true
  }
}
```

> If `tsconfig.json` already exists, the command will ask whether to overwrite it. You can manually add `"extends": "./aliases.tsconfig.json"` to your existing config.