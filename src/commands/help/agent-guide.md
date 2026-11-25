# chef {{version}} — guide for AI coding agents

chef (`@bitrix/chef`) builds, type-checks, lints and tests Bitrix JS extensions. This guide is printed by the installed chef and describes what this version can do. Project conventions — which options to use, what to agree on before a change — come from the project's own instructions and its `chef.config`.

## Concepts

- **Extension** — a directory with `bundle.config.ts` (or `.js`) under a module's `install/js/` or under `local/js/`. Its name is the path after `js/` joined with dots: `ui/install/js/ui/buttons/` → `ui.buttons`.
- **Other buildable directories** — component templates, activities, site templates: any directory with `bundle.config.*` or a legacy `script.es6.js`. They have no name and are addressed by path: `-p <path>`.
- **Sources and output** — sources live in `src/` (or `script.es6.js`). `chef build` writes bundles (`dist/*.bundle.js`, `*.css`, `*.map`, `script.js`) and `config.php`, regenerating them on every build.
- **Dependencies** — the `rel` list in `config.php` is derived from the imports in `src/`. Extensions listed in `inline` of `bundle.config` are left out of it: the code used from them is bundled in.
- **Namespace** — `namespace` in `config.php` is copied from `bundle.config` on every build; an extension without one gets an empty string. The server takes the namespace of an extension from there, so it is not edited by hand.
- **Project root** — chef finds it by itself (a Bitrix source repository or a project with `local/`), so commands work from anywhere inside it.

## What chef can do

- **Build** — `chef build <name>` or `chef build -p <path>` compiles TypeScript, JavaScript, CSS and Vue sources into bundles and updates `config.php`. TypeScript types are checked during the build. `--production` builds minified bundles.
- **Check types** — `chef typecheck <name>` checks types without writing bundles; `--file` narrows the check to specific files.
- **Lint** — `chef lint <name>`; `--fix` applies automatic fixes. Lints with oxlint (the project's oxlint config, or the Bitrix24 presets). oxlint lints Flow files through position-preserving copies; a file nothing can parse is reported as a parsing error.
- **Test** — `chef test <name>` runs unit tests (Mocha in a browser) and e2e tests (Playwright); `chef test unit` and `chef test e2e` run one kind, `chef test module` runs module-level scenario tests. `--list` shows tests without running them, `--grep` filters them by name. E2E tests need `playwright.config.ts` and `.env.test` (`chef init tests`).
- **Create** — `chef create <name>` scaffolds an extension: `bundle.config`, `config.php`, an entry point in `src/`, unit and e2e test stubs.
- **Path aliases** — `chef aliases` regenerates `aliases.tsconfig.json`, which lets TypeScript resolve imports of other extensions by name.
- **Analyze** — `chef diag` subcommands: dependency trees, where an extension is used from JS (`find-usages`) and loaded from PHP (`find-loaders`), bundle sizes, circular dependencies, unused extensions and dependencies.
- **Browser support** — `chef baseline <feature>` tells whether a web feature works in the project's browser targets; `chef diag baseline` checks extensions for unsupported features.
- **Migrate** — `chef flow-to-ts` converts Flow-typed code to TypeScript.

## Behavior worth knowing

- Without a target (`<name>` or `-p <path>`), `build`, `lint`, `typecheck` and `test` process every extension below the current directory.
- Names accept glob patterns: `*` — one level, `**` — all levels (`'ui.bbcode.*'`). Unquoted patterns are expanded or rejected by the shell.
- Types are checked by the TypeScript 7 bundled with chef, not by the project's `typescript` package: an editor or `npx tsc` running TypeScript 5 or 6 can report different errors, mostly for types taken from JS dependencies.
- A TypeScript build also writes `dist/*.bundle.d.ts`: it adds only the extension namespace to the global scope, holding exactly what the entry exports under the export names (`BX.Main.PopupOptions`); internal types stay private to the file. In TypeScript code, take another extension's types with `import type { … } from '<extension>'`.
- The build's browser-support check (`CF1020`, `CF1022`) skips usages behind feature detection: `if (typeof structuredClone === 'function') { … }`, `Promise.try ? Promise.try(fn) : …`, `'at' in list && list.at(-1)`. A method call is compared with builtin methods only when the object it is called on may be such a builtin: methods of the module's own classes and of objects typed with product types are not checked.
- `--force` builds even when type or import checks fail.
- `--watch` keeps running until interrupted.
- When a newer chef is published and stdout is not a terminal, chef prints one line to stderr at exit: `chef: update available <current> → <latest>, run: npm i -g @bitrix/chef`. stdout is not affected. The registry is checked in the background at most once a day, so the line appears from the run after the check. There is no line with `NO_UPDATE_NOTIFIER` or `CI` set, or when chef runs from its sources.
- A test file that fails to build or load (syntax error, missing import, a throw outside `it`) does not stop the run: the other files still run, and the broken one is reported as a failed test (`Failed to build` / `Failed to load`) in a suite named after the file, with the cause and its location.
- Browser targets come from `enforce.targets` of `chef.config`, then the extension's own targets (`targets` in `bundle.config`, the nearest browserslist config, the `BROWSERSLIST` env variable), then `defaults.targets`, then `baseline widely available`. With `deny.targets` in `chef.config` own targets are never applied: only the browserslist config of the project root counts, and own targets fail the build with `CF2001` (or give a warning).
- `CF2001` — an option is not allowed: the project's `chef.config` denies it, or it conflicts with another option.

## Machine-readable output

- With `--reporter json`, commands that support it print a single JSON document to stdout and nothing else. Format: `{{docsDirectory}}/guide/json/response-format.md`.
- Exit codes are the same with and without `--reporter json`: `0` — success, `1` — errors (build, lint, type check, tests, an extension not found), `2` — incompatible options. `chef diag` also exits with `1` when it finds problems, but with `--reporter json` only when the check could not run. A stopped `--watch` exits with `130` (`SIGINT`) or `143` (`SIGTERM`).
- Every error and warning carries a `CFxxxx` code — see "Error codes" below.

## Commands

Run `chef help <command>` (e.g. `chef help test unit`) for option descriptions. A subcommand without its own option line accepts the same options as its parent.

{{commands}}

## Error codes

Explanations and fixes: `{{docsDirectory}}/guide/errors.md` (search for the code).

{{errorCodes}}

## Documentation

Markdown documentation of chef {{version}}, paths relative to `{{docsDirectory}}`. Links like `/en/guide/testing` inside it point to `guide/testing.md`.

{{documents}}
