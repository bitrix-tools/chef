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
| `treeshake` | `boolean` | Удаление неиспользуемого кода (по умолчанию: `true`) |
| `plugins` | `Plugin[]` | Кастомные Rollup-плагины |
| `resolveNodeModules` | `boolean` | Резолв зависимостей из node_modules |
| `babel` | `boolean` | Включение/отключение Babel-транспиляции (по умолчанию: `true`) |
| `standalone` | `boolean` | Автономная сборка с инлайном зависимостей |
| `protected` | `boolean` | Защита от пересборки |
| `rebuild` | `string[]` | Пересборка зависимых расширений |
| `transformClasses` | `boolean` | Транспиляция классов |

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
