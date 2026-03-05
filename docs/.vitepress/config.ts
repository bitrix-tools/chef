import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Chef',
  description: 'CLI toolkit for building, testing and maintaining Bitrix extensions',
  lang: 'en-US',
  base: '/chef/',

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'Chef',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Commands', link: '/commands/build' },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Project Structure', link: '/guide/project-structure' },
          { text: 'Configuration', link: '/guide/configuration' },
          { text: 'TypeScript Setup', link: '/guide/typescript' },
          { text: 'Browserslist', link: '/guide/browserslist' },
          { text: 'Test Setup', link: '/guide/test-setup' },
        ],
      },
      {
        text: 'Commands',
        items: [
          { text: 'build', link: '/commands/build' },
          { text: 'test', link: '/commands/test' },
          { text: 'stat', link: '/commands/stat' },
          { text: 'create', link: '/commands/create' },
          { text: 'init', link: '/commands/init' },
          { text: 'flow-to-ts', link: '/commands/flow-to-ts' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'npm', link: 'https://www.npmjs.com/package/@bitrix/chef' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Made for Bitrix developers',
    },
  },
})
