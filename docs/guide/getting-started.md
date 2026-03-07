# Начало работы

## Требования

- Node.js >= 22
- Проект на Bitrix

## Установка

```bash
npm install -g @bitrix/chef
```

## Инициализация проекта

Перейдите в корень вашего Bitrix-проекта и выполните:

```bash
chef init
```

Эта команда запускает полную инициализацию — создаёт конфиги для сборки и тестирования сразу:

| Файл | Описание |
|------|----------|
| `tsconfig.json` | Конфиг TypeScript с рекомендованными настройками |
| `aliases.tsconfig.json` | Автоматически сгенерированные алиасы путей для всех расширений |
| `.browserslistrc` | Целевые браузеры для Babel и PostCSS |
| `playwright.config.ts` | Конфиг Playwright для unit и e2e тестов |
| `.env.test` | Учётные данные для аутентификации при тестировании |

Если нужно инициализировать только сборку или только тесты — используйте подкоманды:

```bash
chef init build    # Только tsconfig.json, aliases.tsconfig.json, .browserslistrc
chef init tests    # Только playwright.config.ts, .env.test
```

### Ручные настройки после инициализации

**`.env.test`** — заполните учётные данные вашей локальной установки:

```env
BASE_URL=http://localhost
LOGIN=admin
PASSWORD=your_password
```

::: warning
Не коммитьте `.env.test` в систему контроля версий — файл содержит конфиденциальные данные. Добавьте его в `.gitignore`.
:::

**`tsconfig.json`** — если файл уже существовал до инициализации, Chef не перезапишет его. В этом случае добавьте строку вручную:

```json
{
  "extends": "./aliases.tsconfig.json",
  // ваши настройки...
}
```

### Дополнительные зависимости

Chef включает в себя все необходимые инструменты (`typescript`, `@playwright/test`, `mocha`, `chai`) — они устанавливаются вместе с ним и используются при сборке и запуске тестов.

Однако для того чтобы IDE (VS Code, WebStorm и др.) понимала типы TypeScript и типы в тестовых файлах, нужно установить их локально в проекте:

```bash
npm install --save-dev typescript @playwright/test @types/mocha @types/chai
```

После этого установите браузеры Playwright:

```bash
npx playwright install
```

## Первое расширение

Создайте новое расширение:

```bash
chef create my.extension
```

Будет создана директория со всеми необходимыми файлами:

```
local/js/my/extension/
├── bundle.config.ts
├── config.php
└── src/
    └── my.extension.ts
```

Запустите сборку:

```bash
chef build my.extension
```

Запустите тесты:

```bash
chef test my.extension
```

## Что дальше

- [Возможности](/guide/features) — как устроены расширения и как работает сборка
- [JS-расширение](/guide/extension) — структура расширения и конфигурация
- [TypeScript](/guide/typescript) — подробнее об алиасах и `tsconfig.json`
- [Тестирование](/guide/testing) — как писать и запускать тесты