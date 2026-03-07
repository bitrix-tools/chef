# Browserslist

Chef использует [browserslist](https://github.com/browserslist/browserslist) для определения целевых браузеров при транспиляции через [Babel](https://babeljs.io/) и автопрефиксинге CSS через [PostCSS](https://postcss.org/).

По умолчанию Chef нацеливается на `baseline widely available` — браузеры с [широкой поддержкой](https://web-platform-dx.github.io/web-features/) современных веб-возможностей.

## Как это работает

1. Если в `bundle.config.ts` указан параметр `targets` — используется он
2. Иначе Chef ищет файл `.browserslistrc` вверх по дереву директорий от расширения
3. Если файл не найден — используется `baseline widely available`

## Кастомные цели

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

## Миграция с `browserslist`

Параметр `browserslist` в `bundle.config` объявлен устаревшим. Используйте `targets` вместо него:

```ts
// Было
export default {
  browserslist: ['last 2 versions'],
};

// Стало
export default {
  targets: ['last 2 versions'],
};
```

Старый параметр `browserslist` продолжает работать для обратной совместимости.
