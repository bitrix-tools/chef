---
layout: home

hero:
  name: Chef
  text: CLI toolkit for Bitrix extensions
  tagline: Build, test and maintain Bitrix frontend extensions with ease
  image:
    src: /logo.svg
    alt: Chef
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Commands
      link: /commands/build

features:
  - title: TypeScript First
    details: Native TypeScript support with automatic transpilation and path aliases for all extensions.
  - title: Build
    details: Rollup-based bundler with Babel, PostCSS and automatic config.php dependency updates.
  - title: Test
    details: Unit tests (Mocha + Chai) in real browsers via Playwright, and E2E tests.
  - title: Lint
    details: ESLint integration for consistent code quality across all extensions.
  - title: Scaffold
    details: Generate new extensions with a single command using chef create.
  - title: Analyze
    details: Bundle statistics and dependency tree visualization with chef stat.
---