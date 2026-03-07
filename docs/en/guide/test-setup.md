# Test Setup

To run unit and E2E tests you need to initialize the test environment first:

```bash
chef init tests
```

This creates two files in the project root:

| File | Description |
|------|-------------|
| `playwright.config.ts` | Playwright config for running unit and E2E tests in browser |
| `.env.test` | Credentials for automatic authentication during tests |

## Configure `.env.test`

Fill in your local Bitrix installation credentials:

```env
BASE_URL=http://localhost
LOGIN=admin
PASSWORD=your_password
```

| Variable | Description |
|----------|-------------|
| `BASE_URL` | URL of your local Bitrix installation |
| `LOGIN` | Test user login |
| `PASSWORD` | Test user password |

> **Security:** Never commit `.env.test` to version control — it contains sensitive credentials.

## Install Playwright browsers

```bash
npx playwright install
```

## Test file structure

Place tests in the extension's `test/` directory:

```
my.extension/
└── test/
    ├── unit/              # Unit tests (Mocha + Chai, run in browser)
    │   └── example.test.ts
    └── e2e/               # E2E tests (Playwright)
        └── example.spec.ts
```

Unit tests run inside a real browser via Playwright — Mocha and Chai are available globally. E2E tests use the standard Playwright Test API.