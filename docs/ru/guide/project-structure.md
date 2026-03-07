# JS-расширение

JS-расширение — основная единица фронтенд-кода в Bitrix. Это самостоятельный модуль с исходниками, конфигурацией сборки и PHP-манифестом.

## Создание

Создать новое расширение можно командой `chef create`:

```bash
chef create ui.buttons                # TypeScript (по умолчанию)
chef create ui.buttons --tech js      # JavaScript
```

Chef разрезолвит имя расширения в путь и создаст директорию в `local/js/`:

```
ui.buttons  →  local/js/ui/buttons/
my.feature  →  local/js/my/feature/
crm.kanban  →  local/js/crm/kanban/
```

Будут созданы все необходимые файлы:

```
local/js/ui/buttons/
├── bundle.config.ts
├── config.php
├── src/
│   └── ui.buttons.ts
└── test/
    ├── unit/
    │   └── ui.buttons.test.ts
    └── e2e/
        └── ui.buttons.spec.ts
```

Если в проекте есть `tsconfig.json`, Chef автоматически создаст TypeScript-расширение. Если `tsconfig.json` отсутствует — JavaScript. Явно указать можно через `--tech ts` или `--tech js`.

## Структура файлов

Полная структура расширения с тестами:

```
local/js/ui/buttons/
├── bundle.config.ts       # Конфигурация сборки
├── config.php             # PHP-манифест (зависимости, ресурсы)
├── src/
│   └── ui.buttons.ts      # Точка входа
├── dist/
│   ├── ui.buttons.bundle.js   # Скомпилированный JS (генерируется при сборке)
│   └── ui.buttons.bundle.css  # Скомпилированный CSS (генерируется при сборке)
└── test/
    ├── unit/              # Unit-тесты (Mocha + Chai)
    │   └── ui.buttons.test.ts
    └── e2e/               # E2E-тесты (Playwright)
        └── ui.buttons.spec.ts
```

Имя расширения формируется из пути: `local/js/ui/buttons/` → `ui.buttons`.

## bundle.config.ts

Конфигурация сборки расширения. Создаётся в корне директории расширения.

```ts
import type { BundleConfig } from '@bitrix/chef';

export default {
  input: './src/ui.buttons.ts',
  output: './dist/ui.buttons.bundle.js',
  namespace: 'BX.UI.Buttons',
} as BundleConfig;
```

> Поддерживается и JavaScript-версия конфига: `bundle.config.js`.

### Параметры

| Параметр | Тип | Описание |
|----------|-----|----------|
| `input` | `string` | Точка входа |
| `output` | `string \| { js, css }` | Путь к выходному бандлу. Строка — только JS, объект — JS и CSS отдельно |
| `namespace` | `string` | Глобальный неймспейс для экспортов (по умолчанию: `window`) |
| `targets` | `string \| string[]` | Целевые браузеры для Babel и PostCSS |
| `sourceMaps` | `boolean` | Генерация source maps |
| `minification` | `boolean \| object` | Минификация через Terser |
| `treeshake` | `boolean` | Удаление неиспользуемого кода (по умолчанию: `true`) |
| `adjustConfigPhp` | `boolean` | Автоматически обновлять `rel` в `config.php` (по умолчанию: `true`) |
| `protected` | `boolean` | Пропускать расширение при массовом сканировании |
| `concat` | `{ js?, css? }` | Конкатенировать дополнительные файлы в бандл |
| `cssImages` | `object` | Обработка изображений в CSS (`inline` или `copy`) |
| `plugins.babel` | `boolean \| object` | Настройки Babel-плагина |
| `plugins.custom` | `array` | Дополнительные Rollup-плагины |
| `tests.localization` | `object` | Настройки локализации для тестов |
| `rebuild` | `string[]` | Список расширений, которые нужно пересобрать после сборки текущего |

### Разделение JS и CSS

По умолчанию CSS включается в JS-бандл. Чтобы выгрузить CSS в отдельный файл:

```ts
export default {
  input: './src/ui.buttons.ts',
  output: {
    js: './dist/ui.buttons.bundle.js',
    css: './dist/ui.buttons.bundle.css',
  },
  namespace: 'BX.UI.Buttons',
} as BundleConfig;
```

## config.php

PHP-манифест расширения. Содержит пути к собранным файлам и список зависимостей.

```php
<?php
if (!defined('B_PROLOG_INCLUDED') || B_PROLOG_INCLUDED !== true)
{
    die();
}

return [
    'js'  => './dist/ui.buttons.bundle.js',
    'css' => './dist/ui.buttons.bundle.css',
    'rel' => [
        'main.core',
    ],
    'skip_core' => false,
];
```

Chef автоматически обновляет массив `rel` при сборке — анализирует импорты и записывает зависимости. Вручную менять `rel` не нужно.

## Подключение на страницу

```php
\Bitrix\Main\UI\Extension::load('ui.buttons');
```

После подключения все экспорты расширения доступны через неймспейс:

```js
const button = new BX.UI.Buttons.Button({ text: 'Сохранить' });
document.body.appendChild(button.render());
```

## Тесты

### Unit-тесты

Запускаются в реальном браузере через Playwright. Используют Mocha + Chai.

::: tip
`mocha`, `chai` и их типы включены в Chef и используются при запуске `chef test`. Для работы автодополнения и проверки типов в IDE установите их локально:
```bash
npm install --save-dev @types/mocha @types/chai
```
:::

```ts
// test/unit/ui.buttons.test.ts
import { it, describe } from 'mocha';
import { assert } from 'chai';

import { Button } from '../../src/ui.buttons';

describe('Button', () => {
  it('should render node', () => {
    const button = new Button({ text: 'OK' });
    assert.ok(button.render() instanceof HTMLElement);
  });
});
```

### E2E-тесты

Используют Playwright Test API.

Без авторизации — для публичных страниц:

```ts
// test/e2e/ui.buttons.spec.ts
import { test, expect } from '@playwright/test';

test('button is visible on page', async ({ page }) => {
  await page.goto('/my-page');
  await expect(page.locator('.ui-btn')).toBeVisible();
});
```

С автоматической авторизацией — импортируйте из `ui.test.e2e.auth`. Перед каждым тестом расширение автоматически откроет `/auth/`, заполнит форму логина данными из `.env.test` и выполнит вход. Тест получит уже авторизованную страницу:

```ts
// test/e2e/ui.buttons.spec.ts
import { test, expect } from 'ui.test.e2e.auth';

test('button is visible on page', async ({ page }) => {
  // page уже авторизован
  await page.goto('/my-page');
  await expect(page.locator('.ui-btn')).toBeVisible();
});
```

Учётные данные берутся из `.env.test` в корне проекта:

```env
BASE_URL=http://localhost
LOGIN=admin
PASSWORD=your_password
```

Запуск тестов:

```bash
chef test ui.buttons                    # Запустить все тесты
chef test unit ui.buttons                        # Только unit-тесты
chef test unit ui.buttons ./render-button.test.ts # Конкретный файл
chef test e2e ui.buttons                # Только e2e-тесты
chef test ui.buttons --headed           # С видимым браузером
chef test ui.buttons --debug            # С DevTools и sourcemaps
```