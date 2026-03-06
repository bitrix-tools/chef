# TypeScript

Chef поддерживает TypeScript из коробки — компиляция `.ts` файлов встроена в конвейер сборки. Никаких дополнительных настроек для сборки не требуется.

## Инициализация

Для работы TypeScript в IDE и корректной проверки типов нужно инициализировать конфигурацию:

```bash
chef init build
```

Команда создаёт три файла в корне проекта:

| Файл | Описание |
|------|----------|
| `aliases.tsconfig.json` | Алиасы путей для всех расширений в проекте |
| `tsconfig.json` | Основной конфиг TypeScript, расширяет алиасы |
| `.browserslistrc` | Целевые браузеры для Babel и PostCSS |

После инициализации TypeScript-расширения создаются автоматически:

```bash
chef create ui.buttons    # создаст bundle.config.ts и src/ui.buttons.ts
```

## Конфигурация

### tsconfig.json

Генерируется с рекомендованными настройками:

```json
{
  "extends": "./aliases.tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "target": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "allowJs": true,
    "checkJs": false,
    "strict": true,
    "lib": ["ESNext", "DOM"]
  },
  "include": [
    "**/src/**/*.ts"
  ]
}
```

Если `tsconfig.json` уже существовал, Chef не перезапишет его. Добавьте строку вручную:

```json
{
  "extends": "./aliases.tsconfig.json",
  // ваши настройки...
}
```

### aliases.tsconfig.json

Автоматически генерируется на основе всех расширений в проекте:

```json
{
  "compilerOptions": {
    "baseUrl": "/path/to/project",
    "types": ["./bitrix/js/ui/dev/src/ui.dev.ts"],
    "paths": {
      "main.core": ["./bitrix/js/main/core/src"],
      "ui.buttons": ["./local/js/ui/buttons/src"]
    }
  }
}
```

Благодаря этому импорты расширений по имени работают и в редакторе, и при проверке типов:

```ts
import { Loc, Tag } from 'main.core';
import { Button } from 'ui.buttons';
```

### Обновление алиасов

При добавлении новых расширений в проект алиасы нужно регенерировать:

```bash
chef init build
```

Команда пересканирует все расширения и обновит `aliases.tsconfig.json`. `tsconfig.json` при этом не перезаписывается.

## Типизация Bitrix API

Расширение `ui.dev` предоставляет типы для глобального объекта `BX` и других API Bitrix. Chef автоматически подключает его в `aliases.tsconfig.json` через поле `types`, если расширение найдено в проекте.

После этого в коде доступна типизация:

```ts
BX.message('hello');          // тип string
BX.ready(() => { /* ... */ }); // колбэк
```

## Написание расширений

### Точка входа

Все публичные классы и функции экспортируются из точки входа:

```ts
// src/ui.buttons.ts
export class Button {
  #node: HTMLElement;

  constructor(private options: { text: string }) {
    this.#node = document.createElement('button');
    this.#node.textContent = options.text;
  }

  render(): HTMLElement {
    return this.#node;
  }
}

export class ButtonGroup {
  #buttons: Button[] = [];

  add(button: Button): this {
    this.#buttons.push(button);
    return this;
  }
}
```

### Импорт зависимостей

Другие расширения импортируются по имени — как npm-пакеты:

```ts
import { Tag, Loc } from 'main.core';
import { Button } from 'ui.buttons';
import { Popup } from 'main.popup';
```

При сборке Chef подменяет эти импорты на обращения к глобальным неймспейсам зависимостей, а сами зависимости записывает в `config.php`.

### bundle.config.ts

Конфиг сборки тоже типизирован — импортируйте `BundleConfig` из `@bitrix/chef`:

```ts
import type { BundleConfig } from '@bitrix/chef';

export default {
  input: './src/ui.buttons.ts',
  output: {
    js: './dist/ui.buttons.bundle.js',
    css: './dist/ui.buttons.bundle.css',
  },
  namespace: 'BX.UI.Buttons',
  browserslist: true,
} as BundleConfig;
```

## Тесты на TypeScript

### Unit-тесты

```ts
// test/unit/ui.buttons.test.ts
import { it, describe } from 'mocha';
import { assert } from 'chai';

import { Button } from '../../src/ui.buttons';

describe('Button', () => {
  it('should render HTMLElement', () => {
    const button = new Button({ text: 'OK' });
    assert.instanceOf(button.render(), HTMLElement);
  });

  it('should contain correct text', () => {
    const button = new Button({ text: 'Save' });
    assert.equal(button.render().textContent, 'Save');
  });
});
```

Для работы типов в IDE установите локально:

```bash
npm install --save-dev @types/mocha @types/chai
```

### E2E-тесты

```ts
// test/e2e/ui.buttons.spec.ts
import { test, expect } from '@playwright/test';

test('button renders on page', async ({ page }) => {
  await page.goto('/my-page');
  await expect(page.locator('.ui-btn')).toBeVisible();
});
```

Для работы типов Playwright в IDE:

```bash
npm install --save-dev @playwright/test
```

## Проверка типов

Chef не запускает `tsc --noEmit` автоматически при сборке — он только компилирует `.ts` в `.js` через Rollup. Для явной проверки типов запустите вручную:

```bash
npx tsc --noEmit
```