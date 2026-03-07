import { defineConfig } from 'vitepress'

const guideSidebarRu = [
  { text: 'Обзор', link: '/guide/overview' },
  { text: 'Начало работы', link: '/guide/getting-started' },
  { text: 'JS-расширение', link: '/guide/project-structure' },
  { text: 'Конфигурация', link: '/guide/configuration' },
  { text: 'TypeScript', link: '/guide/typescript' },
  { text: 'Vue 3', link: '/guide/vue' },
  { text: 'Тестирование', link: '/guide/testing' },
  { text: 'Browserslist', link: '/guide/browserslist' },
  { text: 'Настройка тестов', link: '/guide/test-setup' },
  { text: 'Production-режим', link: '/guide/production' },
  { text: 'Standalone', link: '/guide/standalone' },
  { text: 'Миграция с CLI', link: '/guide/migration' },
]

const commandsSidebarRu = [
  { text: 'build', link: '/commands/build' },
  { text: 'test', link: '/commands/test' },
  { text: 'stat', link: '/commands/stat' },
  { text: 'create', link: '/commands/create' },
  { text: 'init', link: '/commands/init' },
  { text: 'flow-to-ts', link: '/commands/flow-to-ts' },
]

const guideSidebarEn = [
  { text: 'Overview', link: '/en/guide/overview' },
  { text: 'Getting Started', link: '/en/guide/getting-started' },
  { text: 'JS Extension', link: '/en/guide/project-structure' },
  { text: 'Configuration', link: '/en/guide/configuration' },
  { text: 'TypeScript', link: '/en/guide/typescript' },
  { text: 'Vue 3', link: '/en/guide/vue' },
  { text: 'Testing', link: '/en/guide/testing' },
  { text: 'Browserslist', link: '/en/guide/browserslist' },
  { text: 'Test Setup', link: '/en/guide/test-setup' },
  { text: 'Production Mode', link: '/en/guide/production' },
  { text: 'Standalone', link: '/en/guide/standalone' },
  { text: 'Migration from CLI', link: '/en/guide/migration' },
]

const commandsSidebarEn = [
  { text: 'build', link: '/en/commands/build' },
  { text: 'test', link: '/en/commands/test' },
  { text: 'stat', link: '/en/commands/stat' },
  { text: 'create', link: '/en/commands/create' },
  { text: 'init', link: '/en/commands/init' },
  { text: 'flow-to-ts', link: '/en/commands/flow-to-ts' },
]

export default defineConfig({
  title: 'Chef',
  description: 'CLI-инструмент для сборки, тестирования и поддержки расширений Bitrix',
  base: '/chef/',
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/chef/logo-nav.svg' }],
  ],

  locales: {
    root: {
      label: 'Русский',
      lang: 'ru-RU',
    },
    en: {
      label: 'English',
      lang: 'en-US',
      description: 'CLI toolkit for building, testing and maintaining Bitrix extensions',
      themeConfig: {
        nav: [
          { text: 'Getting Started', link: '/en/guide/getting-started' },
          { text: 'Documentation', link: '/en/guide/overview' },
          { text: 'Commands', link: '/en/commands/build' },
        ],
        sidebar: [
          { text: 'Guide', items: guideSidebarEn },
          { text: 'Commands', items: commandsSidebarEn },
        ],
        footer: {
          message: 'Released under the MIT License.',
          copyright: 'Made for Bitrix developers',
        },
      },
    },
  },

  themeConfig: {
    logo: '/logo-nav.svg',
    siteTitle: 'Chef',

    nav: [
      { text: 'Начало работы', link: '/guide/getting-started' },
      { text: 'Документация', link: '/guide/overview' },
      { text: 'Команды', link: '/commands/build' },
    ],

    sidebar: [
      { text: 'Руководство', items: guideSidebarRu },
      { text: 'Команды', items: commandsSidebarRu },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/bitrix-tools/chef' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/@bitrix/chef' },
    ],

    footer: {
      message: 'Распространяется под лицензией MIT.',
      copyright: 'Создано для разработчиков Bitrix',
    },
  },
})
