import { defineConfig } from 'vitepress'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const pkg = require('../../package.json')

const sidebarRu = [
  {
    text: 'Введение',
    items: [
      { text: 'Начало работы', link: '/guide/getting-started' },
      { text: 'Возможности', link: '/guide/features' },
      { text: 'JS-расширение', link: '/guide/extension' },
      { text: 'Команды', link: '/guide/commands' },
    ],
  },
  {
    text: 'Сборка',
    items: [
      { text: 'TypeScript', link: '/guide/typescript' },
      { text: 'Vue 3', link: '/guide/vue' },
      { text: 'Production-сборка', link: '/guide/production' },
    ],
  },
  {
    text: 'Тестирование',
    items: [
      { text: 'Обзор', link: '/guide/testing' },
      { text: 'Unit-тесты', link: '/guide/testing-unit' },
      { text: 'Unit-тесты Vue 3', link: '/guide/testing-vue' },
      { text: 'E2E-тесты', link: '/guide/testing-e2e' },
      { text: 'E2E-тесты Vue 3', link: '/guide/testing-e2e-vue' },
      { text: 'Component Sandbox', link: '/guide/testing-sandbox' },
    ],
  },
  {
    text: 'Миграция',
    items: [
      { text: 'Flow.js → TypeScript', link: '/guide/flow-to-ts' },
      { text: '@bitrix/cli → @bitrix/chef', link: '/guide/migration' },
    ],
  },
  {
    text: 'Интеграции',
    items: [
      { text: 'PhpStorm', link: '/guide/phpstorm-plugin' },
      { text: 'VS Code <span class="VPBadge info">скоро</span>', link: '/guide/vscode' },
    ],
  },
  {
    text: 'Конфигурация',
    items: [
      { text: 'bundle.config', link: '/config/bundle-config' },
      { text: 'chef.config', link: '/config/chef-config' },
      { text: 'Browserslist', link: '/config/browserslist' },
    ],
  },
  {
    text: 'Проект',
    items: [
      { text: 'История изменений', link: '/changelog' },
    ],
  },
]

const sidebarEn = [
  {
    text: 'Introduction',
    items: [
      { text: 'Getting Started', link: '/en/guide/getting-started' },
      { text: 'Features', link: '/en/guide/features' },
      { text: 'JS Extension', link: '/en/guide/extension' },
      { text: 'Commands', link: '/en/guide/commands' },
    ],
  },
  {
    text: 'Build',
    items: [
      { text: 'TypeScript', link: '/en/guide/typescript' },
      { text: 'Vue 3', link: '/en/guide/vue' },
      { text: 'Production Build', link: '/en/guide/production' },
    ],
  },
  {
    text: 'Testing',
    items: [
      { text: 'Overview', link: '/en/guide/testing' },
      { text: 'Unit Tests', link: '/en/guide/testing-unit' },
      { text: 'Unit Tests Vue 3', link: '/en/guide/testing-vue' },
      { text: 'E2E Tests', link: '/en/guide/testing-e2e' },
      { text: 'E2E Tests Vue 3', link: '/en/guide/testing-e2e-vue' },
      { text: 'Component Sandbox', link: '/en/guide/testing-sandbox' },
    ],
  },
  {
    text: 'Migration',
    items: [
      { text: 'Flow.js → TypeScript', link: '/en/guide/flow-to-ts' },
      { text: '@bitrix/cli → @bitrix/chef', link: '/en/guide/migration' },
    ],
  },
  {
    text: 'Integrations',
    items: [
      { text: 'PhpStorm', link: '/en/guide/phpstorm-plugin' },
      { text: 'VS Code <span class="VPBadge info">soon</span>', link: '/en/guide/vscode' },
    ],
  },
  {
    text: 'Config',
    items: [
      { text: 'bundle.config', link: '/en/config/bundle-config' },
      { text: 'chef.config', link: '/en/config/chef-config' },
      { text: 'Browserslist', link: '/en/config/browserslist' },
    ],
  },
  {
    text: 'Project',
    items: [
      { text: 'Changelog', link: '/en/changelog' },
    ],
  },
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
          { text: pkg.version, link: '/en/changelog' },
        ],
        sidebar: sidebarEn,
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
      { text: pkg.version, link: '/changelog' },
    ],

    sidebar: sidebarRu,

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
