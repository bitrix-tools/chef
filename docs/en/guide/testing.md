# Testing

Chef runs tests in a real browser via [Playwright](https://playwright.dev/). Two types of tests are supported: unit tests ([Mocha](https://mochajs.org/) + [Chai](https://www.chaijs.com/)) and E2E tests (Playwright Test API).

## Setup

Initialize the test environment:

```bash
chef init tests
```

This creates two files in the project root:

| File | Description |
|------|-------------|
| `playwright.config.ts` | Playwright config for running unit and E2E tests in browser |
| `.env.test` | Credentials for automatic authentication during tests |

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

::: warning
Do not commit `.env.test` to version control — it contains sensitive credentials.
:::

Install Playwright browsers:

```bash
npx playwright install
```

### IDE Types

`mocha`, `chai` and their types are included in Chef and used when running `chef test`. For IDE autocompletion, install the types locally:

```bash
npm install --save-dev @types/mocha @types/chai @playwright/test
```

## Running Tests

```bash
# All tests for an extension
chef test vendor.my-extension

# Unit tests only
chef test unit vendor.my-extension

# E2E tests only
chef test e2e vendor.my-extension

# Specific file
chef test unit vendor.my-extension ./utils.test.ts

# Tests matching pattern
chef test vendor.* --grep "should render"

# Watch mode — rerun on changes
chef test vendor.my-extension -w
```

### Debugging

```bash
# Open browser with DevTools
chef test vendor.my-extension --debug

# With visible browser window
chef test vendor.my-extension --headed

# In a specific browser
chef test vendor.my-extension --project chromium
```

In `--debug` mode, source maps are enabled and DevTools are opened — you can set breakpoints directly in your TypeScript source code.

## Bulk Runs

`chef test` without arguments or with a glob pattern (`im.v2.**`) walks through every matching extension. Extensions without tests are skipped silently — only those with tests or problems show up in the output.

Browser console output is hidden by default to keep bulk reports clean. Add `--console` if you need it:

```bash
chef test im.v2.** --console
```

### Task Statuses

Chef shows the failure reason inline next to each extension:

| Status | Meaning |
|--------|---------|
| `✓ Unit tests` | All tests passed |
| `✗ Unit tests (3 failed)` | Some tests failed, the number is how many |
| `✗ Unit tests (build failed)` | The test bundle did not compile (Rollup) |
| `✗ Unit tests (crashed before any tests ran)` | Crashed before the first `it` — usually a setup error |
| `⚠ Unit tests (no tests collected)` | Files exist but Mocha found no `it` (empty `describe`, `.skip`) |
| `— Unit tests (no test files)` | No `*.test.{ts,js}` in the `test/unit/` (or `test/`) directory |
| `— E2E tests (no test files)` | Same for e2e |

### Final Summary

After the run chef prints an aggregated report:

- **Failed Tests (N)** — all failed tests with stack traces and code frames, grouped by extension.
- **Errors (N)** — build errors and runtime crashes, one line per cause.
- **Issues** — list of extensions with error/warning counts.
- **Extensions / Tests / Time** — totals: how many extensions and tests passed/failed, how long it took.

## Tips

### Test Isolation

Each test should be independent. Use `beforeEach`/`afterEach` for setup and cleanup:

```ts
describe('TodoList', () => {
  let list: TodoList;

  beforeEach(() => {
    list = new TodoList();
  });

  afterEach(() => {
    list.destroy();
  });

  it('should add item', () => {
    list.add('Buy milk');
    assert.equal(list.getCount(), 1);
  });

  it('should start empty', () => {
    assert.equal(list.getCount(), 0);
  });
});
```

### Test Organization

Group tests by functionality:

```ts
describe('UserService', () => {
  describe('create', () => {
    it('should create user with valid data', () => { /* ... */ });
    it('should throw on duplicate email', () => { /* ... */ });
  });

  describe('update', () => {
    it('should update user name', () => { /* ... */ });
    it('should not allow empty name', () => { /* ... */ });
  });

  describe('delete', () => {
    it('should soft delete user', () => { /* ... */ });
  });
});
```
