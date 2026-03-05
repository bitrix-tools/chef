# Browserslist

Chef использует [browserslist](https://github.com/browserslist/browserslist) для определения целевых браузеров при транспиляции через Babel и автопрефиксинге CSS.

## Настройка

Создайте файл `.browserslistrc` в корне проекта с рекомендованным конфигом:

```
baseline widely available
```

Это нацеливает на браузеры с [широкой поддержкой](https://web-platform-dx.github.io/web-features/) современных веб-возможностей — хороший вариант по умолчанию для большинства проектов.

Затем включите в `bundle.config.ts`:

```ts
export default {
  input: './src/my.extension.ts',
  output: './dist/my.extension.bundle.js',
  browserslist: true,
};
```

## Как это работает

Когда `browserslist` установлен в `true`, Chef ищет `.browserslistrc` вверх по дереву директорий от расширения. Если файл не найден, настройка не действует.

Также можно указать цели напрямую в конфиге вместо отдельного файла:

```ts
export default {
  // ...
  browserslist: ['last 2 versions', 'not dead'],
};
```

Если `browserslist` не указан или установлен в `false`, используются цели по умолчанию (`IE >= 11`, `last 4 version`).

> При создании расширения через `chef create` сгенерированный конфиг автоматически устанавливает `browserslist: true`, если в проекте есть файл `.browserslistrc`.
