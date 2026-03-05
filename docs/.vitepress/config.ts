import { defineConfig } from 'vitepress'

const guideSidebar = [
  { text: 'Getting Started', link: '/guide/getting-started' },
  { text: 'Project Structure', link: '/guide/project-structure' },
  { text: 'Configuration', link: '/guide/configuration' },
  { text: 'TypeScript Setup', link: '/guide/typescript' },
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
  { text: 'Начало работы', link: '/ru/guide/getting-started' },
  { text: 'Структура проекта', link: '/ru/guide/project-structure' },
  { text: 'Конфигурация', link: '/ru/guide/configuration' },
  { text: 'Настройка TypeScript', link: '/ru/guide/typescript' },
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
          { text: 'Руководство', link: '/ru/guide/getting-started' },
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
    logo: '/logo.svg',
    siteTitle: 'Chef',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Commands', link: '/commands/build' },
    ],

    sidebar: [
      { text: 'Guide', items: guideSidebar },
      { text: 'Commands', items: commandsSidebar },
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