# Структура проекта

Типичное расширение Bitrix выглядит так:

```
local/js/vendor/extension/
├── bundle.config.ts           # Конфигурация сборки
├── config.php                 # PHP-конфиг расширения Bitrix
├── src/
│   └── extension.ts           # Точка входа (имя совпадает с расширением)
├── dist/
│   ├── extension.bundle.js    # Скомпилированный бандл
│   └── extension.bundle.css   # Скомпилированные стили
└── test/
    ├── unit/                  # Unit-тесты (Mocha + Chai)
    │   └── example.test.ts
    └── e2e/                   # E2E-тесты (Playwright)
        └── example.spec.ts
```

Конфигурация TypeScript (`tsconfig.json`) размещается в корне проекта и используется всеми расширениями. Для настройки выполните `chef init build`.

> JavaScript-расширения (точка входа `.js`) тоже поддерживаются.
