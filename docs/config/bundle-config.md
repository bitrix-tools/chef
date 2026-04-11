# bundle.config

Конфигурация сборки расширения. Создайте `bundle.config.ts` в директории расширения:

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

> Также поддерживается JavaScript-конфигурация (`bundle.config.js`).

## Параметры

| Параметр | Тип | Описание |
|----------|-----|----------|
| `input` | `string` | Файл точки входа |
| `output` | `string \| {js, css}` | Путь к выходным бандлам |
| `namespace` | `string` | Глобальное пространство имён для экспортов |
| `concat` | `{js?: string[], css?: string[]}` | Конкатенация файлов в указанном порядке |
| `targets` | `string \| string[]` | Целевые браузеры для транспиляции |
| `sourceMaps` | `boolean` | Генерация source maps |
| `minification` | `boolean \| object` | Настройки минификации Terser |
| `treeshake` | `boolean \| string \| object` | Удаление неиспользуемого кода. Принимает `boolean`, пресет Rollup (`'smallest'`, `'safest'`, `'recommended'`) или объект `TreeshakingOptions` (по умолчанию: `true`) |
| `plugins` | `Plugin[]` | Кастомные Rollup-плагины |
| `resolveNodeModules` | `boolean` | Резолв зависимостей из node_modules |
| `babel` | `boolean` | Включение/отключение Babel-транспиляции (по умолчанию: `true`) |
| `standalone` | `boolean` | Автономная сборка с инлайном зависимостей |
| `protected` | `boolean` | Защита от пересборки |
| `rebuild` | `string[]` | Пересборка зависимых расширений |
| `transformClasses` | `boolean \| string[]` | Транспиляция классов — все (`true`) или по именам |
| `emitDeclaration` | `boolean` | Генерация `.d.ts` с namespace-декларациями (по умолчанию: `true`) |
| `safeNamespaces` | `boolean` | Безопасные обращения к неймспейсам зависимостей через optional chaining |
| `baseline` | `boolean` | Проверка доступности веб-фич при сборке (по умолчанию: `true`) |

## Плагины

Параметр `plugins` принимает массив Rollup-совместимых плагинов. Плагины добавляются в конец цепочки сборки, после встроенных плагинов Chef.

### Установка

Установите нужный плагин в директории расширения:

```bash
cd /path/to/my.extension
npm install @rollup/plugin-alias
```

### Использование

```ts
import alias from '@rollup/plugin-alias';
import { resolve } from 'node:path';

export default {
  input: './src/index.ts',
  output: './dist/my.bundle.js',
  namespace: 'BX.My',
  plugins: [
    alias({
      entries: [
        { find: '@utils', replacement: resolve(import.meta.dirname, 'src/utils') },
      ],
    }),
  ],
};
```

### Несколько плагинов

```ts
import alias from '@rollup/plugin-alias';
import replace from '@rollup/plugin-replace';

export default {
  input: './src/index.ts',
  output: './dist/my.bundle.js',
  namespace: 'BX.My',
  plugins: [
    alias({
      entries: [
        { find: '@utils', replacement: './src/utils' },
      ],
    }),
    replace({
      __VERSION__: JSON.stringify('1.0.0'),
      preventAssignment: true,
    }),
  ],
};
```

## Резолв node_modules

Параметр `resolveNodeModules` включает резолв зависимостей из `node_modules`. По умолчанию Chef считает все npm-зависимости внешними — они не попадают в бандл.

```ts
export default {
  input: './src/index.ts',
  output: './dist/my.bundle.js',
  namespace: 'BX.My',
  resolveNodeModules: true,
};
```

При включении:
1. Установите зависимости: `npm install` в директории расширения
2. Зависимости из `node_modules` будут инлайниться в бандл
3. Размер бандла увеличится, но расширение станет автономным от npm

::: tip
Если нужна полная автономность от Bitrix-зависимостей, используйте [standalone](/guide/production#standalone-сборка) режим.
:::

## Отключение Babel

Параметр `babel` позволяет отключить Babel-транспиляцию. Это полезно, когда код уже предварительно собран и повторная обработка Babel не нужна.

```ts
export default {
  input: './src/index.ts',
  output: './dist/my.bundle.js',
  namespace: 'BX.My',
  babel: false,
};
```

::: warning
Без Babel код не будет транспилирован под целевые браузеры. Используйте эту опцию, только если уверены, что входной код уже совместим с нужными браузерами.
:::

## Транспиляция классов

Параметр `transformClasses` включает транспиляцию ES-классов в функции через Babel. Это необходимо для совместимости с устаревшим кодом, который расширяет классы через `BX.merge`, `Object.assign` или другие паттерны, несовместимые с нативными классами.

Транспилировать все классы:

```ts
export default {
  input: './src/index.ts',
  output: './dist/my.bundle.js',
  namespace: 'BX.My',
  transformClasses: true,
};
```

Транспилировать только указанные классы:

```ts
export default {
  input: './src/index.ts',
  output: './dist/my.bundle.js',
  namespace: 'BX.My',
  transformClasses: ['EventEmitter', 'BaseEvent'],
};
```

При указании массива имён остальные классы остаются нативными. Это позволяет транспилировать только те классы, которые действительно нуждаются в обратной совместимости, сохраняя производительность и размер бандла.

## Декларации типов

При сборке TypeScript-расширений Chef автоматически генерирует файл `.d.ts` с ambient namespace-декларациями рядом с бандлом. Это позволяет IDE предоставлять подсказки при обращении по неймспейсу, например `new BX.UI.Bbcode.App()`.

```
dist/
├── app.bundle.js      # Скомпилированный бандл (без комментариев)
└── app.bundle.d.ts    # Декларации типов с JSDoc
```

JSDoc-комментарии из исходников сохраняются в `.d.ts` для подсказок IDE, но удаляются из рантайм-бандла для уменьшения размера.

Генерация работает только для TypeScript-расширений с указанным `namespace` (отличным от `window`).

Для отключения:

```ts
export default {
  input: './src/index.ts',
  output: './dist/my.bundle.js',
  namespace: 'BX.My',
  emitDeclaration: false,
};
```

## Безопасные неймспейсы

По умолчанию, если расширение зависит от другого расширения и оно не загружено на страницу, при подключении бандла произойдёт фатальная ошибка — JavaScript не сможет обратиться к несуществующему неймспейсу (например, `BX.Main.Core`).

Параметр `safeNamespaces` включает optional chaining для обращений к неймспейсам зависимостей в IIFE-обёртке бандла. Если зависимость отсутствует, вместо фатальной ошибки расширение получит пустой объект. Это даёт возможность проверить наличие зависимости в коде и работать с ней условно:

```js
if (BX.Main?.Core)
{
  // Зависимость загружена, можно использовать
}
```

```ts
export default {
  input: './src/index.ts',
  output: './dist/my.bundle.js',
  namespace: 'BX.My.Extension',
  safeNamespaces: true,
};
```

При включении зависимости в IIFE-обёртке будут обращаться через `?.` и `??`:

```js
// Было:
})(this.BX.My.Extension = this.BX.My.Extension || {}, BX.Main.Core, BX.UI.Buttons);

// Стало:
})(this.BX.My.Extension = this.BX.My.Extension || {}, BX?.Main?.Core??{}, BX?.UI?.Buttons??{});
```

Собственный неймспейс расширения не трансформируется — он уже безопасно инициализируется в начале бандла.

## Переменные окружения

Chef автоматически заменяет переменные окружения при сборке, аналогично [Vite](https://vite.dev/guide/env-and-mode):

| Переменная | Production | Development |
|---|---|---|
| `process.env.NODE_ENV` | `"production"` | `"development"` |
| `import.meta.env.MODE` | `"production"` | `"development"` |
| `import.meta.env.PROD` | `true` | `false` |
| `import.meta.env.DEV` | `false` | `true` |

Замена происходит статически на этапе сборки. Это позволяет tree-shaking вырезать dev-only код из npm-пакетов:

```ts
if (process.env.NODE_ENV !== 'production') {
  console.warn('Debug info');
}
```

В режиме `chef build` (без флагов) переменные подставляются как `development`. В режиме `chef build --production` — как `production`.
