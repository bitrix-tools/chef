---
layout: home

hero:
  name: Chef
  text: Frontend toolkit for Bitrix
  tagline: Write modern TypeScript, build, test and analyze extensions — with one tool.
  image:
    src: /logo.svg
    alt: Chef
  actions:
    - theme: brand
      text: Getting Started
      link: /en/guide/getting-started
    - theme: alt
      text: Documentation
      link: /en/guide/overview

features:
  - icon:
      src: /rollup.svg
    title: Fast Builds
    details: Rollup + Babel + PostCSS under the hood. Vue 3 SFC out of the box. Parallel builds for up to 4 extensions at once. Watch mode with hot reload.
  - icon:
      src: /typescript.svg
    title: TypeScript Out of the Box
    details: Run chef create and get a ready tsconfig, path aliases for all project extensions, and a typed build config.
  - icon:
      src: /vue.svg
    title: Vue 3 Out of the Box
    details: Write Single File Components with TypeScript — Chef compiles templates, styles and scripts. import 'vue' automatically maps to ui.vue3.
  - icon:
      src: /playwright.svg
    title: Browser Testing
    details: Unit tests with Mocha + Chai run in a real browser via Playwright. E2E tests with automatic authentication — no extra setup.
  - icon: 🔍
    title: Bundle Analytics
    details: Bundle sizes, dependency tree and duplicates — chef stat shows everything for one extension or a whole group.
  - icon: 🚀
    title: Scaffold in Seconds
    details: chef create ui.buttons will create an extension with the right structure, config, entry point and test templates.
---

<div class="home-code">

## Try it now

```bash
# Install
npm install -g @bitrix/chef

# Initialize project
chef init

# Create a new extension
chef create ui.my-feature

# Build
chef build ui.my-feature

# Test
chef test ui.my-feature
```

</div>

<style>
.home-code {
  max-width: 960px;
  margin: 0 auto;
  padding: 48px 24px 96px;
}

.home-code h2 {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 24px;
  text-align: center;
}
</style>
