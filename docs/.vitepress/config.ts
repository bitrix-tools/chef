import { defineConfig } from 'vitepress'

const guideSidebarRu = [
  { text: 'Начало работы', link: '/guide/getting-started' },
  { text: 'Возможности', link: '/guide/features' },
  { text: 'JS-расширение', link: '/guide/extension' },
  { text: 'Команды', link: '/guide/commands' },
  { text: 'TypeScript', link: '/guide/typescript' },
  { text: 'Vue 3', link: '/guide/vue' },
  { text: 'Тестирование', link: '/guide/testing' },
  { text: 'Production-сборка', link: '/guide/production' },
  { text: 'Миграция с @bitrix/cli', link: '/guide/migration' },
]

const configSidebarRu = [
  { text: 'bundle.config', link: '/config/bundle-config' },
  { text: 'chef.config', link: '/config/chef-config' },
  { text: 'Browserslist', link: '/config/browserslist' },
]

const guideSidebarEn = [
  { text: 'Getting Started', link: '/en/guide/getting-started' },
  { text: 'Features', link: '/en/guide/features' },
  { text: 'JS Extension', link: '/en/guide/extension' },
  { text: 'Commands', link: '/en/guide/commands' },
  { text: 'TypeScript', link: '/en/guide/typescript' },
  { text: 'Vue 3', link: '/en/guide/vue' },
  { text: 'Testing', link: '/en/guide/testing' },
  { text: 'Production Build', link: '/en/guide/production' },
  { text: 'Migration from @bitrix/cli', link: '/en/guide/migration' },
]

const configSidebarEn = [
  { text: 'bundle.config', link: '/en/config/bundle-config' },
  { text: 'chef.config', link: '/en/config/chef-config' },
  { text: 'Browserslist', link: '/en/config/browserslist' },
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
          { text: 'Guide', link: '/en/guide/getting-started' },
          { text: 'Config', link: '/en/config/bundle-config' },
          { text: 'Commands', link: '/en/guide/commands' },
        ],
        sidebar: [
          { text: 'Guide', items: guideSidebarEn },
          { text: 'Config', items: configSidebarEn },
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
      { text: 'Руководство', link: '/guide/getting-started' },
      { text: 'Конфигурация', link: '/config/bundle-config' },
      { text: 'Команды', link: '/guide/commands' },
    ],

    sidebar: [
      { text: 'Руководство', items: guideSidebarRu },
      { text: 'Конфигурация', items: configSidebarRu },
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
