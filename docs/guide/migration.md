# Миграция с @bitrix/cli

Это руководство поможет перейти с `@bitrix/cli` на `@bitrix/chef`. Chef — это переработанный с нуля инструмент с тем же назначением: сборка, тестирование и поддержка JS-расширений Bitrix.

## Зачем переходить

- **Скорость** — сборка значительно быстрее за счёт оптимизированного пайплайна
- **TypeScript** — нативная поддержка TypeScript из коробки, включая конфиги (`bundle.config.ts`)
- **Современные цели** — по умолчанию `baseline widely available` вместо `IE >= 11`
- **E2E-тесты** — поддержка Playwright для end-to-end тестирования
- **Новые команды** — `chef stat` для анализа зависимостей, `chef flow-to-ts` для миграции с Flow
- **Node.js 22+** — использует современные возможности платформы

## Установка

```bash
# Удалить старый CLI
npm uninstall -g @bitrix/cli

# Установить Chef
npm install -g @bitrix/chef
```

После установки команда `chef` доступна глобально. Старая команда `bitrix` больше не используется.

## Команды

| @bitrix/cli | @bitrix/chef | Примечание |
|-------------|-------------|------------|
| `bitrix build` | `chef build` | Полностью совместимы |
| `bitrix build -w` | `chef build -w` | Watch-режим |
| `bitrix build -p ./path` | `chef build -p ./path` | Сборка по пути |
| `bitrix test` | `chef test` | Полностью переработано (Playwright) |
| `bitrix create name` | `chef create name` | Полностью совместимы |
| — | `chef init` | **Новое.** Инициализация проекта |
| — | `chef stat` | **Новое.** Анализ зависимостей и размеров |
| — | `chef flow-to-ts` | **Новое.** Миграция Flow.js → TypeScript |
| — | `chef test unit` | **Новое.** Запуск только unit-тестов |
| — | `chef test e2e` | **Новое.** Запуск только e2e-тестов |

### Сборка по имени

В CLI сборка работала только по пути. В Chef можно собирать по имени расширения и использовать glob-паттерны:

```bash
# Сборка конкретных расширений
chef build main.core ui.buttons

# Сборка по паттерну
chef build ui.bbcode.*

# Сборка всех расширений в текущей директории (как раньше)
chef build
```

## bundle.config

Конфиги полностью совместимы — существующие `bundle.config.js` работают без изменений. Но есть несколько отличий, которые стоит учесть.

### Полный пример

Типичный конфиг @bitrix/cli и его эквивалент в Chef:

```js
// bundle.config.js (@bitrix/cli)
module.exports = {
  input: './src/ui.buttons.js',
  output: './dist/ui.buttons.bundle.js',
  namespace: 'BX.UI.Buttons',
  browserslist: ['last 2 versions'],
  plugins: {
    resolve: true,
    babel: true,
    custom: [],
  },
};
```

```ts
// bundle.config.ts (@bitrix/chef)
export default {
  input: './src/ui.buttons.ts',
  output: './dist/ui.buttons.bundle.js',
  namespace: 'BX.UI.Buttons',
  targets: ['last 2 versions'],
  resolveNodeModules: true,
};
```

Что изменилось:
- `module.exports` → `export default` (ESM)
- `.js` → `.ts` (TypeScript)
- `browserslist` → `targets`
- `plugins.resolve` → `resolveNodeModules`
- `plugins.babel` → `babel` (по умолчанию `true`, можно не указывать)
- `plugins.custom` → `plugins` (массив Rollup-плагинов)

### browserslist → targets

Параметр `browserslist` переименован в `targets`:

```ts
// Было (@bitrix/cli)
export default {
  browserslist: true,        // читать из .browserslistrc
  browserslist: ['last 2 versions'],  // или напрямую
};

// Стало (@bitrix/chef)
export default {
  targets: ['last 2 versions'],  // если нужны кастомные цели
};
```

**Важное отличие:** в Chef не нужно указывать `browserslist: true`. Chef автоматически ищет `.browserslistrc` вверх по дереву директорий. Если файл не найден, используется `baseline widely available`.

Старый параметр `browserslist` продолжает работать для обратной совместимости.

### plugins → plugins, resolveNodeModules, babel

Формат `plugins` изменился. Раньше это был объект с полями `resolve`, `babel`, `custom`. Теперь `plugins` — это массив Rollup-плагинов, а `resolve` и `babel` вынесены в отдельные параметры:

```ts
// Было (@bitrix/cli)
export default {
  plugins: {
    resolve: true,
    babel: false,
    custom: [myPlugin()],
  },
};

// Стало (@bitrix/chef)
export default {
  resolveNodeModules: true,
  babel: false,
  plugins: [myPlugin()],
};
```

Старый формат с объектом продолжает работать для обратной совместимости — Chef автоматически преобразует его в новый.

### Новое: rebuild

Chef поддерживает параметр `rebuild` — автоматическая пересборка зависимых расширений:

```ts
export default {
  rebuild: ['ui.bbcode.encoder', 'ui.bbcode.formatter'],
};
```

`rebuild` принимает массив имён расширений. Chef пересоберёт их автоматически после сборки текущего расширения и покажет статус каждого в отчёте.

### Целевые браузеры по умолчанию

| | @bitrix/cli | @bitrix/chef |
|---|-------------|--------------|
| **По умолчанию** | `IE >= 11, last 4 version` | `baseline widely available` |
| **Определение** | Параметр `browserslist` в конфиге | Файл `.browserslistrc` → fallback на дефолт |

Если ваш проект должен поддерживать старые браузеры, укажите цели явно:

```ts
export default {
  targets: ['IE >= 11', 'last 4 version'],
};
```

Или создайте `.browserslistrc` в корне проекта:

```
IE >= 11
last 4 version
```

## Тестирование

Тестирование в Chef полностью переработано.

| | @bitrix/cli | @bitrix/chef |
|---|-------------|--------------|
| **Фреймворк** | Mocha + JSDom | Playwright + Mocha |
| **Среда** | JSDom (эмуляция) | Реальные браузеры (Chromium, Firefox, WebKit) |
| **E2E-тесты** | — | Playwright Test |
| **TypeScript** | — | Нативная поддержка |
| **Debug** | — | `--debug` с DevTools |

### Инициализация

```bash
chef init tests
```

Создаёт `playwright.config.ts` и `.env.test` в корне проекта.

### Установка браузеров

```bash
npx playwright install
```

### Структура тестов

Тесты переехали из `test/` в подкаталоги:

```
# Было (@bitrix/cli)
my.extension/
└── test/
    └── example.test.js

# Стало (@bitrix/chef)
my.extension/
└── test/
    ├── unit/
    │   └── example.test.ts
    └── e2e/
        └── example.spec.ts
```

### Синтаксис тестов

Unit-тесты по-прежнему используют Mocha + Chai, синтаксис не изменился:

```ts
import { describe, it } from 'mocha';
import { assert } from 'chai';

describe('MyFeature', () => {
  it('should work', () => {
    assert.ok(true);
  });
});
```

## TypeScript

Chef имеет нативную поддержку TypeScript. Для настройки проекта:

```bash
chef init build
```

Команда создаст `tsconfig.json`, `aliases.tsconfig.json` и `.browserslistrc`.

После этого расширения можно писать на TypeScript и импортировать по имени:

```ts
import { Loc, Tag } from 'main.core';
import { Button } from 'ui.buttons';
```

Подробнее — в разделе [TypeScript](/guide/typescript).

## Пошаговый план миграции

1. **Установить Chef**
   ```bash
   npm uninstall -g @bitrix/cli
   npm install -g @bitrix/chef
   ```

2. **Инициализировать проект**
   ```bash
   cd /path/to/project
   chef init
   ```

3. **Проверить сборку**
   ```bash
   chef build my.extension
   ```
   Существующие `bundle.config.js` работают без изменений.

4. **Обновить конфиги** (опционально)
   - Переименовать `bundle.config.js` → `bundle.config.ts`
   - Заменить `browserslist` → `targets`
   - Заменить `plugins: { resolve, babel, custom }` → `resolveNodeModules`, `babel`, `plugins: [...]`

5. **Настроить тесты** (если используются)
   ```bash
   chef init tests
   npx playwright install
   ```
   Перенести тесты в `test/unit/`.

6. **Обновить CI/CD**
   - Заменить `bitrix build` → `chef build`
   - Заменить `bitrix test` → `chef test`
   - Убедиться что Node.js >= 22
