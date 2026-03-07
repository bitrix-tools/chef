<p align="center">
  <img src=".github/assets/logo.svg" width="140" alt="Chef Logo">
</p>

<h1 align="center">Chef</h1>

<p align="center">
  <b>CLI-инструмент для сборки, тестирования и поддержки JS-расширений Bitrix</b>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@bitrix/chef"><img src="https://img.shields.io/npm/v/@bitrix/chef.svg?style=flat-square&colorA=18181B&colorB=28CF8D" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@bitrix/chef"><img src="https://img.shields.io/npm/dm/@bitrix/chef.svg?style=flat-square&colorA=18181B&colorB=28CF8D" alt="npm downloads"></a>
  <a href="https://github.com/bitrix-tools/chef/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-28CF8D?style=flat-square&colorA=18181B" alt="License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-28CF8D?style=flat-square&colorA=18181B" alt="Node.js"></a>
  <a href="https://bitrix-tools.github.io/chef/"><img src="https://img.shields.io/badge/docs-bitrix--tools.github.io%2Fchef-28CF8D?style=flat-square&colorA=18181B" alt="Documentation"></a>
</p>

<p align="center">
  <a href="./README.en.md">English</a>
</p>

<br>

## Возможности

- **TypeScript First** — нативная поддержка TypeScript с автоматической транспиляцией
- **Сборка** — бандлер на основе Rollup с Babel, PostCSS и автозаменой `process.env.NODE_ENV`
- **Тесты** — unit-тесты (Mocha + Chai) в реальных браузерах через Playwright и E2E-тесты
- **Линтинг** — интеграция с ESLint
- **Scaffold** — создание новых расширений командой `chef create`
- **Миграция** — конвертация Flow.js в TypeScript командой `chef flow-to-ts`
- **Аналитика** — статистика бандлов и визуализация дерева зависимостей

<br>

## Быстрый старт

```bash
npm install -g @bitrix/chef
```

Инициализация окружения сборки:

```bash
chef init build
```

Создание и сборка первого расширения:

```bash
chef create my.extension
chef build my.extension
```

<br>

## Команды

| Команда | Описание |
|---------|----------|
| `chef build` | Сборка расширений (TypeScript, Babel, PostCSS) |
| `chef test` | Запуск unit и E2E тестов (подкоманды `unit`/`e2e` для раздельного запуска) |
| `chef stat` | Анализ размера бандлов и зависимостей |
| `chef create <name>` | Создание нового расширения |
| `chef init` | Инициализация окружения сборки и тестов |
| `chef init build` | Инициализация TypeScript, алиасов и browserslist |
| `chef init tests` | Инициализация только тестового окружения |
| `chef flow-to-ts` | Миграция Flow.js в TypeScript |

<br>

## Конфигурация

Создайте `bundle.config.ts` в директории расширения:

```ts
export default {
  input: './src/my.extension.ts',
  output: {
    js: './dist/my.extension.bundle.js',
    css: './dist/my.extension.bundle.css',
  },
  namespace: 'BX.MyExtension',
};
```

### Параметры

| Параметр | Тип | Описание |
|----------|-----|----------|
| `input` | `string` | Точка входа |
| `output` | `string \| {js, css}` | Путь к выходному бандлу |
| `namespace` | `string` | Глобальный неймспейс для экспортов |
| `concat` | `{js?: string[], css?: string[]}` | Конкатенация файлов в указанном порядке |
| `targets` | `string \| string[]` | Целевые браузеры для транспиляции |
| `sourceMaps` | `boolean` | Генерация source maps |
| `minification` | `boolean \| object` | Минификация через Terser |
| `treeshake` | `boolean` | Удаление неиспользуемого кода (по умолчанию: true) |
| `plugins` | `Plugin[]` | Кастомные Rollup-плагины |
| `resolveNodeModules` | `boolean` | Резолв зависимостей из node_modules |
| `babel` | `boolean` | Включение/отключение Babel (по умолчанию: true) |
| `rebuild` | `string[]` | Расширения для пересборки после сборки текущего |

> Также поддерживается JavaScript-конфигурация (`bundle.config.js`).

<br>

## Browserslist

Chef использует [browserslist](https://github.com/browserslist/browserslist) для определения целевых браузеров при транспиляции через Babel и автопрефиксинге CSS.

По умолчанию Chef нацеливается на `baseline widely available` — браузеры с [широкой поддержкой](https://web-platform-dx.github.io/web-features/) современных веб-возможностей.

### Как это работает

1. Если `targets` указан в `bundle.config.ts` — используется он
2. Иначе Chef ищет файл `.browserslistrc` вверх по дереву директорий
3. Если файл не найден — используется `baseline widely available`

### Кастомные цели

Указать цели напрямую в конфиге:

```ts
export default {
  // ...
  targets: ['last 2 versions', 'not dead'],
};
```

Или создать файл `.browserslistrc` в корне проекта (команда `chef init build` создаст его автоматически):

```
baseline widely available
```

<br>

## Структура проекта

```
local/js/vendor/extension/
├── bundle.config.ts           # Конфигурация сборки
├── config.php                 # Конфиг расширения Bitrix
├── src/
│   └── extension.ts           # Точка входа (имя совпадает с расширением)
├── dist/
│   ├── extension.bundle.js    # Скомпилированный бандл
│   └── extension.bundle.css   # Скомпилированные стили
└── test/
    ├── unit/                  # Unit-тесты (Mocha + Chai)
    │   └── example.test.ts
    └── e2e/                   # E2E-тесты (Playwright)
        └── example.spec.ts
```

Конфигурация TypeScript (`tsconfig.json`) размещается в корне проекта и используется всеми расширениями. Создаётся командой `chef init build`.

> Также поддерживаются JavaScript-расширения (точки входа `.js`).

<br>

## Настройка TypeScript

Инициализация окружения сборки:

```bash
chef init build
```

Команда:

1. **Сканирует все расширения** в проекте
2. **Генерирует `aliases.tsconfig.json`** с алиасами путей для каждого расширения
3. **Создаёт `tsconfig.json`** с рекомендованными настройками
4. **Создаёт `.browserslistrc`** с рекомендованными целевыми браузерами

После инициализации можно импортировать расширения по имени:

```ts
import { Loc, Tag } from 'main.core';
import { Button } from 'ui.buttons';
```

> Если `tsconfig.json` уже существует, команда предложит перезаписать его. Можно вручную добавить `"extends": "./aliases.tsconfig.json"` в существующий конфиг.

<br>

## Настройка тестов

Для запуска unit и E2E тестов необходимо сначала инициализировать тестовое окружение:

```bash
chef init tests
```

Создаёт два файла в корне проекта:

| Файл | Описание |
|------|----------|
| `playwright.config.ts` | Конфиг Playwright для запуска unit и E2E тестов в браузере |
| `.env.test` | Учётные данные для автоматической аутентификации при тестировании |

### Настройка `.env.test`

Заполните учётные данные вашей локальной установки Bitrix:

```env
BASE_URL=http://localhost
LOGIN=admin
PASSWORD=your_password
```

> **Безопасность:** Не коммитьте `.env.test` в систему контроля версий — файл содержит конфиденциальные данные.

### Установка браузеров Playwright

```bash
npx playwright install
```

### Запуск тестов

```bash
chef test main.core                       # Тестирование конкретного расширения
chef test ui.* --headed                   # Запуск с видимым браузером
chef test main.core -w                    # Watch-режим
chef test --grep "should render"          # Фильтр по имени теста
chef test main.core --debug               # Открыть браузер с DevTools и sourcemaps
chef test main.core --project chromium    # Запуск только в конкретном браузере
```

<br>

## Требования

- Node.js >= 22
- Проект на Bitrix или директория с исходниками модуля

<br>

## Лицензия

[MIT](./LICENSE)

<br>

---

<p align="center">
  Создано для разработчиков Bitrix
</p>
