# Scenario Tests

Scenario tests cover behavior that spans **several extensions at once** — for example, a user signs in, walks through portal pages, opens the messenger and sends a message. Such a scenario is not tied to a single extension, so the tests live at the module level rather than inside `install/js/...`.

Technically these are ordinary E2E tests built on the [Playwright Test API](https://playwright.dev/docs/api/class-test) — the same imports, fixtures and API as [extension E2E tests](/en/guide/testing-e2e). Only the location and the run command differ.

## Structure

Scenario tests live in the module's `tests/chef/e2e/` directory:

```
# Module sources repository
crm/
└── tests/
    └── chef/
        └── e2e/
            ├── portal-navigation.spec.ts
            └── messenger-send-message.spec.ts

# Installed Bitrix
local/modules/crm/
└── tests/
    └── chef/
        └── e2e/
            └── portal-navigation.spec.ts
```

::: tip
On an installed Bitrix, scenario tests are looked up only under `local/modules/<module>/`. The system `bitrix/` directory is read-only and is not used.
:::

## Running

```bash
# Scenario tests for a specific module
chef test module crm

# Several modules in one run
chef test module crm sale

# The module of the current directory (when no name is given)
chef test module
```

The `module` subcommand supports the same options as `chef test e2e`:

```bash
chef test module crm --headed                 # Visible browser window
chef test module crm --debug                  # Debug with DevTools and sourcemaps
chef test module crm --grep "messenger"       # Filter by test name
chef test module crm --project chromium       # A specific browser
chef test module crm -w                        # Watch mode
```

Without `--project`, tests run in every browser from `playwright.config.ts`. A module with no tests is marked `skipped` and does not count as passed.

## Example

An authorized walk through portal pages using the `ui.test.e2e.auth` fixture — the login happens once per run and is reused across tests:

```ts
import { test, expect } from 'ui.test.e2e.auth';

test.describe('Portal navigation (authorized)', () => {
  const pages = [
    { name: 'Home', url: '/' },
    { name: 'Chats and calls', url: '/online/' },
    { name: 'Activity Stream', url: '/stream/' },
  ];

  for (const { name, url } of pages)
  {
    test(`opens "${name}" (${url})`, async ({ page }) => {
      const response = await page.goto(url);

      expect(response?.status()).toBeLessThan(400);
      await expect(page).not.toHaveURL(/\/(auth|login)/);
    });
  }
});
```

Setting up the test environment (`playwright.config.ts`, `.env.test`, the auth fixture) is covered in [Testing](/en/guide/testing) and [E2E Tests](/en/guide/testing-e2e).
