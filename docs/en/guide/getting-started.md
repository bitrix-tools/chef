# Getting Started

## Requirements

- Node.js >= 22
- Bitrix project

## Installation

```bash
npm install -g @bitrix/chef
```

## Project Initialization

Navigate to the root of your Bitrix project and run:

```bash
chef init
```

This command runs full initialization — creates configs for both build and testing at once:

| File | Description |
|------|-------------|
| `tsconfig.json` | TypeScript config with recommended settings |
| `aliases.tsconfig.json` | Auto-generated path aliases for all extensions |
| `.browserslistrc` | Target browsers for Babel and PostCSS |
| `playwright.config.ts` | Playwright config for unit and e2e tests |
| `.env.test` | Credentials for authentication during testing |

To initialize only build or only tests — use subcommands:

```bash
chef init build    # Only tsconfig.json, aliases.tsconfig.json, .browserslistrc
chef init tests    # Only playwright.config.ts, .env.test
```

### Manual steps after initialization

**`.env.test`** — fill in your local Bitrix installation credentials:

```env
BASE_URL=http://localhost
LOGIN=admin
PASSWORD=your_password
```

::: warning
Do not commit `.env.test` to version control — it contains sensitive credentials. Add it to `.gitignore`.
:::

**`tsconfig.json`** — if the file already existed before initialization, Chef will not overwrite it. In that case, add the line manually:

```json
{
  "extends": "./aliases.tsconfig.json",
  // your settings...
}
```

### Additional dependencies

Chef includes all required tools (`typescript`, `@playwright/test`, `mocha`, `chai`) — they are installed with it and used during build and test runs.

However, for IDE (VS Code, WebStorm, etc.) to understand TypeScript types and test file types, install them locally in the project:

```bash
npm install --save-dev typescript @playwright/test @types/mocha @types/chai
```

Then install Playwright browsers:

```bash
npx playwright install
```

## First Extension

Create a new extension:

```bash
chef create my.extension
```

A directory with all necessary files will be created:

```
local/js/my/extension/
├── bundle.config.ts
├── config.php
└── src/
    └── my.extension.ts
```

Build it:

```bash
chef build my.extension
```

Run tests:

```bash
chef test my.extension
```

## What's Next

- [Features](/en/guide/features) — how extensions work and how the build pipeline works
- [JS Extension](/en/guide/extension) — extension structure and configuration
- [TypeScript](/en/guide/typescript) — more about aliases and `tsconfig.json`
- [Testing](/en/guide/testing) — how to write and run tests
- [AI Agents](/en/guide/ai-agents) — how to connect the chef guide for Claude Code, Codex and other agents
