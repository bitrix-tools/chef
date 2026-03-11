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
