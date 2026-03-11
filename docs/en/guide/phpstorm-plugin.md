# PhpStorm

The **Bitrix Chef** plugin adds PhpStorm integration with the `@bitrix/chef` CLI tool:

- **Run unit tests** — green Run/Debug arrows on `describe`/`it` blocks
- **Run e2e tests** — green Run arrows on Playwright `test()`/`test.describe()` blocks
- **Debug unit tests** — Debug with breakpoints in source TypeScript/JavaScript code
- **bundle.config** — custom icon for `bundle.config.js`/`bundle.config.ts`
- **Create extensions** — New → Bitrix Extension

## Requirements

- PhpStorm 2025.2+
- `@bitrix/chef` installed globally (`npm install -g @bitrix/chef`)

## Installation

### Via Custom Plugin Repository

The plugin is not published on JetBrains Marketplace, but you can add an update repository:

1. Open **Settings** → **Plugins**
2. Click ⚙️ → **Manage Plugin Repositories...**
3. Add the URL:
   ```
   https://bitrix-tools.github.io/chef/updatePlugins.xml
   ```
4. Find **Bitrix Chef** in the **Marketplace** tab and click **Install**
5. Restart PhpStorm

Updates will be delivered automatically.

### From file

1. Download the ZIP from the [Releases](https://github.com/bitrix-tools/chef-phpstorm-plugin/releases) page
2. **Settings** → **Plugins** → ⚙️ → **Install Plugin from Disk...**
3. Select the downloaded ZIP
4. Restart PhpStorm

## Running unit tests

In `*.test.ts` / `*.test.js` files, green arrows will appear next to `describe` and `it`:

- **▶ Run** — run tests with results in Test Runner
- **🐛 Debug** — run with debugging (breakpoints, step-by-step)

Results are displayed in PhpStorm's standard test tree with code navigation support.

## Running e2e tests

In `*.spec.ts` / `*.spec.js` files, green **▶ Run** arrows will appear next to Playwright's `test()` and `test.describe()` calls.

E2e test results are also displayed in PhpStorm's test tree.

## Debugging unit tests

1. Set a breakpoint in a source file (`.ts` or `.js`)
2. Click **Debug** (🐛) next to the test
3. Wait for the breakpoint to be hit

Debugging works via Chrome DevTools Protocol — the plugin connects to Chromium launched by `chef test`.

::: tip
The first Debug run takes a few extra seconds — Chromium starts and loads the test page.
:::

## Creating an extension

**File** → **New** → **Bitrix Extension** — opens a dialog:

- **Extension name** — the extension name (e.g., `ui.my-feature`)
- **Language** — TypeScript or JavaScript

The `chef create` command will scaffold the extension structure with a build config, entry point, and test templates.

## bundle.config

`bundle.config.js` and `bundle.config.ts` files are displayed with a Chef icon in the project tree.
