import { defineConfig } from 'vitepress'

const guideSidebar = [
  { text: 'Overview', link: '/guide/overview' },
  { text: 'Getting Started', link: '/guide/getting-started' },
  { text: 'JS Extension', link: '/guide/project-structure' },
  { text: 'TypeScript', link: '/guide/typescript' },
  { text: 'Browserslist', link: '/guide/browserslist' },
  { text: 'Test Setup', link: '/guide/test-setup' },
]

const commandsSidebar = [
  { text: 'build', link: '/commands/build' },
  { text: 'test', link: '/commands/test' },
  { text: 'stat', link: '/commands/stat' },
  { text: 'create', link: '/commands/create' },
  { text: 'init', link: '/commands/init' },
  { text: 'flow-to-ts', link: '/commands/flow-to-ts' },
]

const guideSidebarRu = [
  { text: 'Обзор', link: '/ru/guide/overview' },
  { text: 'Начало работы', link: '/ru/guide/getting-started' },
  { text: 'JS-расширение', link: '/ru/guide/project-structure' },

  { text: 'TypeScript', link: '/ru/guide/typescript' },
  { text: 'Browserslist', link: '/ru/guide/browserslist' },
  { text: 'Настройка тестов', link: '/ru/guide/test-setup' },
]

const commandsSidebarRu = [
  { text: 'build', link: '/ru/commands/build' },
  { text: 'test', link: '/ru/commands/test' },
  { text: 'stat', link: '/ru/commands/stat' },
  { text: 'create', link: '/ru/commands/create' },
  { text: 'init', link: '/ru/commands/init' },
  { text: 'flow-to-ts', link: '/ru/commands/flow-to-ts' },
]

export default defineConfig({
  title: 'Chef',
  description: 'CLI toolkit for building, testing and maintaining Bitrix extensions',
  base: '/chef/',

  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
    },
    ru: {
      label: 'Русский',
      lang: 'ru-RU',
      description: 'CLI-инструмент для сборки, тестирования и поддержки расширений Bitrix',
      themeConfig: {
        nav: [
          { text: 'Начало работы', link: '/ru/guide/getting-started' },
          { text: 'Документация', link: '/ru/guide/overview' },
          { text: 'Команды', link: '/ru/commands/build' },
        ],
        sidebar: [
          { text: 'Руководство', items: guideSidebarRu },
          { text: 'Команды', items: commandsSidebarRu },
        ],
        footer: {
          message: 'Распространяется под лицензией MIT.',
          copyright: 'Создано для разработчиков Bitrix',
        },
      },
    },
  },

  themeConfig: {
    logo: '/logo-nav.svg',
    siteTitle: 'Chef',

    nav: [
      { text: 'Getting Started', link: '/guide/getting-started' },
      { text: 'Documentation', link: '/guide/overview' },
      { text: 'Commands', link: '/commands/build' },
    ],

    sidebar: [
      { text: 'Guide', items: guideSidebar },
      { text: 'Commands', items: commandsSidebar },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/bitrix-tools/chef' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/@bitrix/chef' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Made for Bitrix developers',
    },
  },
})