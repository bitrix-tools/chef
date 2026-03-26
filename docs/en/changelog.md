# Changelog

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

