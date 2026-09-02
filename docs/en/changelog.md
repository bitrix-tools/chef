# Changelog

## v1.23.0 <Badge type="tip" text="9/2/2026" />

The test reporter no longer loses flaky tests: the summary shows how many passed on a retry, names them, and warns that Playwright writes a missing reference screenshot on the failed attempt — a green run with retries is no proof of the baseline. A run where some selected tests reported no result now fails with a Mismatch message instead of exiting 0 green — such a run will turn red in CI. --reporter json gained retries on the per-browser result and flaky in the counters.

## v1.22.0 <Badge type="tip" text="9/1/2026" />

Playwright options can now be passed straight to chef test: anything chef does not claim as its own goes to the runner, so chef test e2e ui.buttons --update-snapshots works with no workarounds. The common options are listed in chef test e2e --help, but every Playwright option works, including ones added in fresh runner releases. When the @playwright/test versions in the project and in chef have drifted apart, an e2e run warns and points at the project binary for direct calls. A --list run now shows why it failed instead of a bare "errored".

## v1.21.0 <Badge type="tip" text="7/10/2026" />

chef test output improvements:
- Single per-browser status bar: startup stages (starting/building/preparing) then N/M counters and the running test, one look from launch to finish
- Results grouped by describe block (like --list): the suite path as a heading, tests beneath it; a multi-browser test is one line tagged with every engine
- Retried tests are flagged as flaky, counted separately in the summary
- Skip launching a browser when an extension has no test files
- Ctrl+C during a run restores the terminal properly (cursor and input mode)

## v1.20.0 <Badge type="tip" text="7/9/2026" />

chef test improvements:
- --list — enumerate tests without running them (unit/e2e/module), with a per-kind summary
- --console [browser|node|all] — print console.* output from tests
- Failed e2e artifacts (screenshot, video, trace) in the report and --json, grouped by browser
- JSON reporter for module tests; unified e2e handling for extensions and modules
- --grep normalized to NFC (correct Cyrillic matching); a hint when a multi-word pattern is passed without quotes
- Clear errors instead of "no tests collected": unreachable test page, broken config, failed e2e run

## v1.19.0 <Badge type="tip" text="7/6/2026" />

Dropped Mercurial support. The chef flow-to-ts and chef init hooks commands now work with Git only: file moves via git mv, git hooks instead of .hg/hgrc.

## v1.18.1 <Badge type="tip" text="7/2/2026" />

Fixed source maps of built bundles — positions no longer drift (lines point to the real source code). Types accessed through a main.core container (e.g. Cache.MemoryCache) now resolve to a namespace reference in .d.ts instead of a relative import

## v1.18.0 <Badge type="tip" text="7/1/2026" />

Flow-to-TypeScript migration now converts module.exports to export default in bundle.config. All files created by chef (templates, aliases.tsconfig.json, migration output) end with a trailing newline

## v1.17.1 <Badge type="tip" text="7/1/2026" />

Docs for multi-user e2e tests: defining multiple users in .env.test and selecting them via test.use({ user }) and loginAs

## v1.17.0 <Badge type="tip" text="6/25/2026" />

Added the chef test module command for module-level E2E scenario tests — for checks that span several extensions at once. Tests live in the module's tests/chef/e2e/; on an installed Bitrix they are looked up under local/modules/. Extensions and modules with no tests are now reported as skipped instead of passed.

## v1.16.0 <Badge type="tip" text="6/10/2026" />

Sequential browser execution in e2e tests and reworked test output.

- Browser engines in e2e runs now execute sequentially, one at a time — runs are stable on memory-constrained machines
- The status bar shows every browser's state: finished, running (with a spinner and counter), or queued, plus the total elapsed time
- Every test run in every browser is rendered as its own line with an accumulating browser tag
- The final summary includes a per-browser breakdown
- Tests that pass on retry are no longer reported as failed
- Fixed duplicated lines and leaked control sequences in non-terminal output (IDE, CI, pipes)
- Durations across all reports use a single format: milliseconds, seconds, minutes, hours

## v1.15.0 <Badge type="tip" text="5/20/2026" />

- fix(build): preserve config.php when the build fails. Previously, a type-check or Rollup error would rewrite rel with an empty array, and PhpConfigManager's fallback would turn it into ['main.polyfill.core'] with skip_core: true. The bundle on disk stayed intact while the manifest was silently corrupted.
- feat(diag): find-usages was reworked on top of AST and split into two commands — find-usages (consumer lookup) and find-loaders (loader lookup).

## v1.14.0 <Badge type="tip" text="5/18/2026" />

The `baseline-check` module — which detects JavaScript and CSS features unsupported by target browsers during `chef build` and `chef diag baseline` — has been completely rewritten.

**Before:** the API matcher relied on hardcoded lists (`staticMethods`, `globalApis`, `instanceMethodOwners`), so every new JavaScript API slipped past the check until someone added it to the list manually. As a result, `RegExp.escape`, `Promise.try`, `Object.groupBy`, `Iterator.from` and other modern APIs went undetected even with outdated `.browserslistrc` targets.

**After:** the check is built automatically from two sources:

- **`@mdn/browser-compat-data`** — the same data MDN uses to render its compatibility tables. Every static method, constructor, global function, and instance method is indexed up front. Static vs instance is resolved through the TC39 `spec_url` (the formal source of truth) with a runtime introspection fallback.

- **AST via `@babel/parser`** — replaces the line-based regex scan. Handles JS / TS / TSX / JSX / Flow, ignores API names inside string literals and comments, and respects local shadowing (`const Promise = bluebird`, `import { Promise } from 'bluebird'`, etc.).

- **Syntax features** (`?.`, `??`, `??=`, `||=`, `&&=`, `**`, `...`) are now checked against `bcd.javascript.operators` via a declarative AST-node-to-BCD-key bridge.

**Additionally:**

- The checker was extracted to a standalone `src/modules/baseline/` module shared by the rollup plugin and the `chef diag baseline` command. The command now forces baseline checks via `extension.generate()` even when the bundle config does not opt in.

- For instance methods (e.g. `.some()` exists on Array since ES5 and on Iterator since Chrome 122+), a warning is reported only when the method is unsupported on every owner — otherwise common iteration methods like `.map()` and `.filter()` would falsely trigger on modern bundles.

**Test coverage:** 212 new tests added under `test/baseline/` (`bcd-index`, `ast-walker`, `syntax-map`, `ignore`, `api-coverage`, `css-coverage`, `e2e`). The existing 58 tests were migrated to the new module API and 13 regression cases were added. End-to-end tests spawn `chef diag baseline` and `chef build` against a fresh fixture repo to lock down the actual user-facing behaviour.

## v1.13.1 <Badge type="tip" text="5/14/2026" />

- build: re-exports from external extensions now compile to plain assignments (exports.Foo = dep.Foo) instead of live-binding getters via Object.defineProperty — fixes the runtime "Maximum call stack size exceeded" crash when two extensions share a namespace
- diag: new `chef diag re-exports` command — finds extensions that re-export symbols from other extensions, flags critical cases (shared namespace, self-reference) and wildcard re-exports
- build: warnings during build for same-namespace re-exports (CF1015) and inter-extension circular dependencies (CF1006) — both with a code frame on the actual `import` line and concrete fix hints, including Runtime.loadExtension() for deferred loading
- build: in-bundle file circular imports are now filtered — only direct cycles (A → B → A) are reported, longer chains are left to `chef diag circular-imports`; rich `details` explain the TDZ failure mode and how to fix
- build: TypeScript directory imports auto-index — `import './lib'` and `import './lib/'` correctly resolve to `./lib/index.{ts,tsx,mts,cts}` (Vite-like behaviour)

## v1.13.0 <Badge type="tip" text="5/14/2026" />

- build: re-exports from external extensions now compile to plain assignments (exports.Foo = dep.Foo) instead of live-binding getters via Object.defineProperty — fixes the runtime "Maximum call stack size exceeded" crash when two extensions share a namespace
- diag: new `chef diag re-exports` command — finds extensions that re-export symbols from other extensions, flags critical cases (shared namespace, self-reference) and wildcard re-exports
- build: warnings during build for same-namespace re-exports (CF1015) and inter-extension circular dependencies (CF1006) — both with a code frame on the actual `import` line and concrete fix hints, including Runtime.loadExtension() for deferred loading
- build: in-bundle file circular imports are now filtered — only direct cycles (A → B → A) are reported, longer chains are left to `chef diag circular-imports`; rich `details` explain the TDZ failure mode and how to fix
- build: TypeScript directory imports auto-index — `import './lib'` and `import './lib/'` correctly resolve to `./lib/index.{ts,tsx,mts,cts}` (Vite-like behaviour)

## v1.12.5 <Badge type="tip" text="5/13/2026" />

- diag: richer CHEF_DTS warning with a per-kind fix recipe (vue-components, computed-arrow, export-const, generic) — heading, code frame, at-location, and a ready-to-paste fix snippet
- diag: drop phantom CHEF_DTS warnings on structurally empty sibling exports like Object.freeze({} as const) (e.g. Special from ui.icon-set.api.core)
- docs: new "Troubleshooting" page with a section on DTS inlining (RU + EN)
- ci: release tests now run on a single Node version (22) per OS

## v1.12.4 <Badge type="tip" text="5/12/2026" />

fix(windows): `chef aliases` now works correctly on Windows — `aliases.tsconfig.json` contains POSIX-only path separators and TypeScript resolves aliases again.

Cross-platform fixes for `chef build`, `chef test`, `chef lint`, `chef diag`, `chef init` and related modules: a single path-normalisation approach via `normalizePath`/`isAbsoluteAnyPlatform`, `shell` flag for `npx`/`hg` spawns on Windows, `pathToFileURL` for dynamic imports and clickable links, `os.tmpdir()` instead of hard-coded `/tmp`, stack-trace regex accepts Windows paths, `chef.config.ts` loads through `tsx/cjs/api`.

ci: a matrix of tests now runs on ubuntu/macos/windows × Node 22/24 before npm publish, so a failure on any platform blocks the release.

## v1.12.0 <Badge type="tip" text="5/8/2026" />

Declaration emit-time diagnostics (e.g. TS4023) now surface as build warnings instead of being silently dropped. A new structural detector warns when a type literal in the .d.ts matches the shape of a value imported from a sibling extension (including transitive re-exports), and suggests adding a `: typeof X` annotation to keep the namespace reference. Fixed duplicate output for destructured exports like `export const { a, b, c } = X` — previously the statement was rendered once per destructured name. Stale .d.ts is now removed when a fresh bundle cannot be produced, so consumers do not work against a phantom API.

## v1.11.0 <Badge type="tip" text="5/7/2026" />

New `--reporter <name>` flag for build/lint/test/typecheck/diag commands.
Available reporters: `default` (human-readable, default), `json` (structured JSON
to stdout), and `teamcity` (`chef test` only).

JSON shape:
- Top-level `chefVersion` and `cwd`
- Unresolved extension names go into a separate `notFound` field
- Test failures carry `file`/`line`/`column`/`frame` and `diff` (no full stack trace)
- Test JSON builds the suite path correctly and reports the actual browser name (`chromium`/`firefox`/`webkit`)
- Lint and typecheck no longer duplicate messages between `details` and `errors`
- `bundles[].fileName` renamed to `bundles[].file`

## v1.10.0 <Badge type="tip" text="5/4/2026" />

- Improved `chef test` bulk run output: extensions without tests are skipped silently, errors and failed tests are aggregated into a single end-of-run summary
- Failure reason is now shown inline next to each task: `(build failed)`, `(N failed)`, `(crashed before any tests ran)`, `(no tests collected)`, `(no test files)`
- Added `--console` flag — browser console output is now hidden by default to keep bulk reports clean
- Added a `Tests` row to the final summary with totals across all extensions

## v1.9.1 <Badge type="tip" text="4/30/2026" />

Global namespaces for npm-remapped dependencies: when standalone.exposeNamespaces is enabled, npm package exports are now registered under the source extension namespace (e.g. ui.lexical.core → globalThis.BX.UI.Lexical.Core).

## v1.9.0 <Badge type="tip" text="4/29/2026" />

- Rewrote the .d.ts emitter on top of the TypeScript Compiler API: AST-positional edits, proper npm type resolution via sibling extensions, ImportTypeNode support, emit for entries that import outside packageRoot
- Transitively walk sibling npm imports when matching ownership — types from sub-packages (e.g. @vue/runtime-core behind vue) now reference the sibling's ambient namespace instead of being inlined
- bundle.config: new `types` field pointing at a .d.ts file — `chef aliases` and webpack resolvers use it instead of `input` for design-time resolution

## v1.8.3 <Badge type="tip" text="4/17/2026" />

• standalone: npm packages in remap now resolve through Rollup's node-resolve (ESM instead of CJS)
• standalone: simplified dependency namespace exposure — less runtime code, cleaner bundle
• test runner: test bundle no longer inlines the dependency graph; building tests for large packages no longer breaks

## v1.8.2 <Badge type="tip" text="4/16/2026" />

Fixed runtime errors in standalone builds with `exposeNamespaces: true`: TDZ errors with circular dependencies, crashes on read-only properties of frozen objects, and conflicts when a dependency namespace matches the current extension namespace.

## v1.8.1 <Badge type="tip" text="4/16/2026" />

- Unused import warnings now show exact names and files with code frames

## v1.8.0 <Badge type="tip" text="4/15/2026" />

- Added production build mode and package.json export conditions support
- Standalone builds now include CSS and assets from dependencies
- Fixed d.ts generation: correct handling of re-exports through barrel files and tsconfig path resolution
- Fixed absolute paths in sourcemaps when concatenating files
- Fixed safeNamespaces for Rollup 4 IIFE format
- Fixed CSS-only dependency resolution in config.php
- Added --force flag to skip project config validation

## v1.7.0 <Badge type="tip" text="4/15/2026" />

- Standalone builds: inline all dependencies into a single bundle with `remap` support for dependency overrides
- CSS-only extensions: use CSS file as entry point without JS wrapper
- `cssImages.absolutePaths` option for absolute image URLs in CSS
- `exposeNamespaces` option for standalone builds
- Fixed protected extension inlining in standalone mode
- E2E tests: proper Playwright config lookup and graceful handling of empty test suites

## v1.6.3 <Badge type="tip" text="4/13/2026" />

- Fixed removal of side-effect imports during build (e.g. handler registration files)
- Fixed `adjustConfigPhp: false` being ignored in bundle.config
- Tree-shaking settings aligned with Rollup defaults

## v1.6.2 <Badge type="tip" text="4/13/2026" />

Added support for `tests/` directory as an alternative to `test/` for unit and e2e tests

## v1.6.1 <Badge type="tip" text="4/11/2026" />

- Fixed selective class transpilation: static properties of other classes are no longer affected

## v1.6.0 <Badge type="tip" text="4/11/2026" />

- New `chef baseline` command — check web feature availability for current browser targets
- New `chef diag baseline` subcommand — overview of unsupported features across all extensions
- Build now warns about usage of APIs and CSS properties not supported by target browsers
- `chef typecheck` now resolves external dependencies via tsconfig paths and includes extension `.d.ts` files
- `transformClasses` accepts an array of class names for selective transpilation

## v1.5.1 <Badge type="tip" text="4/1/2026" />

- Fixed update check crash on Windows (EINVAL when spawning npm.cmd)
- Diagnostic commands (chef diag) no longer write files to disk when resolving dependencies

## v1.5.0 <Badge type="tip" text="4/1/2026" />

- New diagnostic commands: `deps-tree` (dependency tree with `--depth`, `--flat`, `--why`) and `bundle-size` (bundle size with `--with-deps`)
- Asset sizes (images, fonts, SVG) are now included in `top-bundle-size` and `top-total-size` — only files actually referenced from bundles are counted
- Column sorting for `top-bundle-size` (`--sort js|css|assets|total`) and `top-total-size` (`--sort own|total|deps|tree`)
- Fixed parsing of `config.php` files with early conditional returns
- Fixed `.d.ts` generation: JSDoc-annotated interfaces are now placed outside the namespace
- Fixed `preset-env` application to TypeScript files based on `targets`

## v1.4.1 <Badge type="tip" text="3/30/2026" />

Fixed startup crash on global install. Fixed doubled indentation in TypeScript extension bundles

## v1.4.0 <Badge type="tip" text="3/29/2026" />

- Reworked `.d.ts` file generation: entry-point traversal, cross-file type resolution, re-export aliases, abstract classes, function overloads, unique symbols, generics
- Fixed transpilation of TypeScript files imported from outside the package root (e.g. `../../src/`)
- Added declaration emitter test suite (99 cases)

## v1.3.1 <Badge type="tip" text="3/27/2026" />

Added update notification for new chef versions. When running CLI in a terminal, npm registry is checked for updates with results cached for 24 hours. If a newer version is available, an informative message with update instructions is displayed after the command finishes.

## v1.3.0 <Badge type="tip" text="3/27/2026" />

- Tab indentation in bundle output instead of spaces
- Summary output when building or testing multiple extensions
- deny.exportDefault rule in chef.config — block export default in entry points
- Fixed false circular dependency reports and faster filtered scans
- Suppressed Babel deoptimised styling warning for large files
- Fixed TypeScript dependency transpilation in standalone test bundles

## v1.2.1 <Badge type="tip" text="3/26/2026" />

- Fixed CSS image path generation when copying to dist — stable structure with images/ prefix and correct url() rewriting
- Fixed config.php creation when building components and templates — file is only updated for extensions
- Fixed console error capture in chef test — runtime errors and uncaught exceptions are now displayed, output is deduplicated across browsers
- Fixed bundle duplication when concat file has the same basename as output
- Fixed blank lines left by stripped comments in TypeScript builds
- Excluded bundle output files from chef lint and chef typecheck
- Added support for rollup-compatible treeshake option format in bundle.config
- Added --exclude option for lint and typecheck commands

## v1.2.0 <Badge type="tip" text="3/25/2026" />

New chef typecheck command for checking TypeScript types in extensions. Supports extension names, glob patterns, --path and --file options. Not-found errors unified under CF2005.

## v1.1.2 <Badge type="tip" text="3/25/2026" />

Fixed type checking during build: compilerOptions from tsconfig.json (including lib) are now passed to the type checker. Updated tsconfig.json template with DOM.Iterable and WebWorker libraries.

## v1.1.1 <Badge type="tip" text="3/25/2026" />

Fixed namespace for dependencies without bundle.config — uses BX in source environment, BX for bitrix/ extensions and window for others in project environment. Comments are no longer stripped from JS extensions, only from TypeScript.

## v1.1.0 <Badge type="tip" text="3/24/2026" />

New safeNamespaces option in bundle.config — safe dependency namespace access via optional chaining in the IIFE wrapper. Fixed copying large CSS images to dist and CSS ordering in bundles.

## v1.0.0 <Badge type="tip" text="3/24/2026" />

- `chef lint` command — extension linting via ESLint 9 with TypeScript support, caching, and auto-fix
- `chef diag` command — project diagnostics: top dependencies, bundle sizes, circular dependencies, unused extensions, usage search
- `chef aliases` and `chef init hooks` commands — TypeScript path alias generation and VCS hooks for auto-updating
- `chef --version` flag to check installed version
- Bundle minification via Terser instead of oxc-minify
- Extension config validation before build with detailed error messages
- Warning when `.env.test` is missing before running tests
- Test watcher debounce to prevent concurrent reruns
- `--include`/`--exclude` filters for diagnostic commands

## v0.0.0-beta.15 <Badge type="tip" text="3/13/2026" />

- Generate `.d.ts` namespace declarations for TypeScript extensions
- Strip comments from bundle output
- `**` glob pattern for deep extension matching
- Bundle CSS and dependencies into test bundle
- Structured diagnostics with CF error codes
- Replace internal dependencies: terser → oxc-minify, php-parser → built-in config.php parser, rollup-plugin-postcss → built-in CSS plugin, p-queue → built-in queue
- Remove unused dependencies (@vue/compiler-sfc, @rollup/plugin-typescript)
- Remove ora dependency from test and init reporters

## v0.0.0-beta.14 <Badge type="tip" text="3/11/2026" />

Added TypeScript type-checking during build. Errors are displayed with a code snippet, underline, and a clickable file link. If errors are found, the build stops before Rollup starts.

## v0.0.0-beta.13 <Badge type="tip" text="3/11/2026" />

- Fixed chef init when installed from npm
- Fixed message formatting in chef init
- Bilingual release notes (RU/EN) with per-locale changelog in docs

## v0.0.0-beta.12 <Badge type="tip" text="3/11/2026" />

- PhpStorm integration — run/debug tests, TeamCity reporter, CDP debugging
- New test reporter with live per-browser status updates
- Test bundle caching across browsers and Rollup module caching across extensions
- Project config `chef.config.ts` — deny rules, defaults, enforce policies
- Auto-replace environment variables in builds
- Improved Flow → TypeScript migration with new type transformations
- Production builds (`--production`), standalone bundles, custom Rollup plugins
- Lazy-load commands and plugins for faster cold start
- Bilingual documentation deployed to GitHub Pages
- npm publishing via Trusted Publisher (OIDC provenance)

