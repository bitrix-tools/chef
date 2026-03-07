# Конфигурация

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
| `treeshake` | `boolean` | Удаление неиспользуемого кода (по умолчанию: true) |
| `plugins` | `Plugin[]` | Кастомные Rollup-плагины |
| `resolveNodeModules` | `boolean` | Резолв зависимостей из node_modules |
| `babel` | `boolean` | Включение/отключение Babel-транспиляции (по умолчанию: true) |
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
npm install @rollup/plugin-replace
```

### Использование

```ts
import replace from '@rollup/plugin-replace';

export default {
  input: './src/index.ts',
  output: './dist/my.bundle.js',
  namespace: 'BX.My',
  plugins: [
    replace({
      'process.env.NODE_ENV': JSON.stringify('production'),
      preventAssignment: true,
    }),
  ],
};
```

### Несколько плагинов

```ts
import replace from '@rollup/plugin-replace';
import alias from '@rollup/plugin-alias';

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

### CommonJS-плагины

Для плагинов без ESM-экспорта используйте `require`:

```js
const myPlugin = require('rollup-plugin-my');

module.exports = {
  input: './src/index.js',
  output: './dist/my.bundle.js',
  namespace: 'BX.My',
  plugins: [
    myPlugin({ /* опции */ }),
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
Если нужна полная автономность от Bitrix-зависимостей, используйте [standalone](/guide/standalone) режим.
:::

## Отключение Babel

Параметр `babel` позволяет отключить Babel-транспиляцию. Это полезно, когда код уже предварительно собран и повторная обработка Babel не нужна.

```ts
export default {
  input: './src/index.js',
  output: './dist/my.bundle.js',
  namespace: 'BX.My',
  babel: false,
};
```

::: warning
Без Babel код не будет транспилирован под целевые браузеры. Используйте эту опцию, только если уверены, что входной код уже совместим с нужными браузерами.
:::
