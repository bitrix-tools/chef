# Changelog

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

