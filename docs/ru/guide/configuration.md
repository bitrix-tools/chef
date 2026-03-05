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
| `output` | `string \| {js, css}` | Путь к выходному бандлу |
| `namespace` | `string` | Глобальный неймспейс для экспортов |
| `concat` | `{js?: string[], css?: string[]}` | Конкатенация файлов в указанном порядке |
| `browserslist` | `boolean \| string[]` | Целевые браузеры для транспиляции |
| `sourceMaps` | `boolean` | Генерация source maps |
| `minification` | `boolean \| object` | Настройки минификации Terser |
| `treeshake` | `boolean` | Удаление неиспользуемого кода (по умолчанию: true) |
