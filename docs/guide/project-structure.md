# Project Structure

A typical Bitrix extension looks like this:

```
local/js/vendor/extension/
├── bundle.config.ts           # Build configuration
├── config.php                 # Bitrix extension config
├── src/
│   └── extension.ts           # Entry point (named after extension)
├── dist/
│   ├── extension.bundle.js    # Compiled bundle
│   └── extension.bundle.css   # Compiled styles
└── test/
    ├── unit/                  # Unit tests (Mocha + Chai)
    │   └── example.test.ts
    └── e2e/                   # E2E tests (Playwright)
        └── example.spec.ts
```

TypeScript configuration (`tsconfig.json`) is placed in the project root and shared across all extensions. Use `chef init build` to set it up.

> JavaScript extensions (`.js` entry points) are also supported.