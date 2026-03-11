# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**@bitrix/chef** — CLI-инструмент для сборки, тестирования и поддержки JS-расширений Bitrix. Написан на TypeScript, использует ESM-модули.

## Common Commands

```bash
# Запуск тестов
npm test

# Запуск тестов с watch-режимом
npm run test:watch
```

`npm run build` НЕ нужен для разработки — chef запускается напрямую через tsx.

## CLI Commands

- `chef build` — сборка JS-расширений (Rollup + Babel + PostCSS)
- `chef test` — запуск unit и e2e тестов (Playwright + Mocha)
- `chef stat` — статистика по расширениям (зависимости, размеры бандлов)
- `chef create <name>` — создание scaffold нового расширения
- `chef init` — инициализация TypeScript/тестового окружения
- `chef flow-to-ts` — миграция Flow.js кода в TypeScript

## Architecture

### Entry Point

`src/cli.ts` — регистрирует команды через Commander.js

### Key Directories

- `src/commands/` — CLI-команды (build, test, stat, create, init, flow-to-ts)
- `src/modules/` — основная бизнес-логика:
  - `config/` — парсинг конфигов (bundle.config.js, config.php, chef.config.ts)
  - `engines/` — движки со strategy pattern (build → Rollup, lint → ESLint, test → Playwright)
  - `packages/` — работа с пакетами/расширениями Bitrix (BasePackage, стратегии поиска)
  - `services/` — высокоуровневые сервисы (flat-структура: package-builder, package-linter, package-test-runner и др.)
- `src/environment/` — определение типа окружения (source/project)
- `src/shared/` — общий код между командами (options, tasks)
- `src/task/` — система задач (task runner, иконки)
- `src/utils/` — утилиты (файлы, строки, пакеты, пути, VCS)

### Core Abstractions

**BasePackage** (`src/modules/packages/base-package.ts`) — фасад для работы с Bitrix-расширением: свойства пакета + делегация действий в сервисы.

**Engines** (`src/modules/engines/`) — strategy pattern:
- `build/` → BuildEngine → BuildStrategy → RollupBuildStrategy
- `lint/` → LintEngine → LintStrategy → ESLintStrategy
- `test/` → TestEngine → TestStrategy → PlaywrightStrategy

**Environment** (`src/environment/environment.ts`) — определяет тип окружения (source — исходники Bitrix, project — проект на базе Bitrix).

**ConfigManager** — менеджер конфигурации со стратегиями:
- `BundleConfigManager` — для bundle.config.js/ts
- `PhpConfigManager` — для config.php (парсинг PHP через php-parser)
- `ChefConfigManager` — для chef.config.ts (конфиг проекта)

## Tech Stack

- Node.js >=22
- TypeScript (ES2022, ESNext modules)
- Rollup, Babel, PostCSS — сборка расширений
- Playwright + Mocha + Chai — тестирование в браузере
- Commander.js — CLI

## Testing CLI Commands

Тестовый репозиторий с исходниками Bitrix:

```bash
cd /Users/belov/Projects/modules && chef build ui.bbcode.*
cd /Users/belov/Projects/modules && chef test main.core
cd /Users/belov/Projects/modules && chef stat ui.*
```

chef глобально залинкован через `npm link`, изменения в коде доступны сразу (tsx).

**ВАЖНО:** После тестовой сборки откатывай изменения в собранных экстеншнах:

```bash
cd /Users/belov/Projects/modules && hg revert ui/install/js/ui/bbcode/parser
```

## PhpStorm Plugin

Плагин для PhpStorm лежит в отдельном репозитории: `/Users/belov/Projects/opensource/@bitrix/chef-phpstorm-plugin` (GitHub: `bitrix-tools/chef-phpstorm-plugin`).

Функциональность:
- Запуск/отладка тестов — зелёные стрелки Run/Debug на `describe`/`it` блоках
- Debug через CDP (Chrome DevTools Protocol) с брейкпоинтами
- Кастомная иконка для bundle.config.js/ts
- Создание расширений — New > Bitrix Extension → `chef create`

Взаимодействие с chef:
- TeamCity reporter: `chef test unit <name> --reporter teamcity`
- CDP debugging: `--cdp-port 9222`

Стек: Kotlin, IntelliJ Platform SDK, Gradle, JDK 21, PhpStorm 2025.2+.

## Documentation

VitePress, расположена в `docs/`. Два языка: русский (корень `docs/`) и английский (`docs/en/`).

```
docs/
├── .vitepress/config.ts   # Конфиг VitePress (nav, sidebar, locales)
├── index.md               # Главная (RU)
├── guide/                 # Руководство (RU)
├── config/                # Справка по конфигам (RU)
├── public/                # Статика (logo.svg)
└── en/                    # Английская локализация
    ├── index.md
    ├── guide/
    └── config/
```

```bash
npm run docs:dev     # Dev-сервер: http://localhost:5173/chef/
npm run docs:build   # Сборка в docs/.vitepress/dist/
```

### Workflow

1. Сначала пишем на русском в `docs/`
2. Проверяем через `npm run docs:dev`
3. Синхронизируем английский эквивалент в `docs/en/`
4. Проверяем сборку: `npm run docs:build`
5. Коммитим обе версии вместе

**Разрешения:** при работе с документацией можно свободно создавать, редактировать, удалять и перемещать любые файлы в `docs/` без дополнительного подтверждения.

### Деплой

GitHub Actions (`.github/workflows/docs.yml`) деплоит на GitHub Pages при пуше в `main` с изменениями в `docs/`.

Сайт: `https://bitrix-tools.github.io/chef/`

### Важные детали

- `base: '/chef/'` в конфиге VitePress — обязательно для GitHub Pages
- `rm package-lock.json && npm install` в CI — lock-файл macOS не содержит linux-бинарники Rollup
- При добавлении новой страницы — обновить `sidebar` в `config.ts` для обоих языков

## Development Workflow

- После внесения правок проверять типизацию: `npx tsc --noEmit`

## Release Workflow

Релиз одной командой: `npm run release -- <type> "RU описание" "EN description"`

1. Подготовить описание изменений на двух языках (на основе коммитов с прошлого релиза)
2. Показать описание пользователю и дождаться подтверждения
3. Запустить `npm run release -- <type> "RU описание" "EN description"`
4. CI автоматически: публикует на npm, обновляет changelog в доке (RU/EN раздельно), деплоит доку

В GitHub Release оба языка через разделитель `---`. В доке — каждый в свою языковую версию.

## Commit Guidelines

- В коммитах и коде НЕ упоминать использование AI (без "Generated with Claude", "Co-Authored-By: Claude" и т.п.)
- Перед коммитом ОБЯЗАТЕЛЬНО показать текст сообщения пользователю и дождаться подтверждения
- Никогда не упоминать что что-то сделано «в стиле» другой технологии (vitest, webpack и т.п.) — ни в коммитах, ни в описаниях релизов, ни в документации. Описывать функциональность своими словами.
