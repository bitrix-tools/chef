# Changelog

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

