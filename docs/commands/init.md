# chef init

Initialize build and test environment.

```bash
chef init [command] [options]
```

## Subcommands

### `chef init build`

Initialize TypeScript, path aliases, and browserslist for the project.

```bash
chef init build [options]
```

| Option | Description |
|--------|-------------|
| `-p, --path <path>` | Initialize in specific directory |

This command:
1. Scans all extensions in the project
2. Generates `aliases.tsconfig.json` with path aliases for every extension
3. Creates `tsconfig.json` with recommended settings
4. Creates `.browserslistrc` with recommended browser targets

See [TypeScript Setup](/guide/typescript) for details.

### `chef init tests`

Initialize Playwright test environment.

```bash
chef init tests [options]
```

| Option | Description |
|--------|-------------|
| `-p, --path <path>` | Initialize in specific directory |

Creates `playwright.config.ts` and `.env.test` in the project root.

See [Test Setup](/guide/test-setup) for details.