# Тестирование

Chef запускает тесты в реальном браузере через [Playwright](https://playwright.dev/). Поддерживаются два вида тестов: unit-тесты ([Mocha](https://mochajs.org/) + [Chai](https://www.chaijs.com/)) и E2E-тесты (Playwright Test API).

## Подготовка

Инициализируйте тестовое окружение:

```bash
chef init tests
```

Команда создаёт два файла в корне проекта:

| Файл | Описание |
|------|----------|
| `playwright.config.ts` | Конфиг Playwright для запуска unit и E2E тестов в браузере |
| `.env.test` | Учётные данные для автоматической аутентификации при тестировании |

Заполните учётные данные вашей локальной установки Bitrix:

```env
BASE_URL=http://localhost
LOGIN=admin
PASSWORD=your_password
```

| Переменная | Описание |
|------------|----------|
| `BASE_URL` | URL локальной установки Bitrix |
| `LOGIN` | Логин тестового пользователя |
| `PASSWORD` | Пароль тестового пользователя |

::: warning
Не коммитьте `.env.test` в систему контроля версий — файл содержит конфиденциальные данные.
:::

Установите браузеры Playwright:

```bash
npx playwright install
```

### Типы для IDE

`mocha`, `chai` и их типы включены в Chef и используются при запуске `chef test`. Для работы автодополнения в IDE установите типы локально:

```bash
npm install --save-dev @types/mocha @types/chai @playwright/test
```

## Запуск тестов

```bash
# Все тесты расширения
chef test vendor.my-extension

# Только unit-тесты
chef test unit vendor.my-extension

# Только e2e-тесты
chef test e2e vendor.my-extension

# Конкретный файл
chef test unit vendor.my-extension ./utils.test.ts

# Тесты по паттерну
chef test vendor.* --grep "should render"

# Watch-режим — перезапуск при изменениях
chef test vendor.my-extension -w
```

### Отладка

```bash
# Открыть браузер с DevTools
chef test vendor.my-extension --debug

# С видимым окном браузера
chef test vendor.my-extension --headed

# В конкретном браузере
chef test vendor.my-extension --project chromium
```

В режиме `--debug` включаются source maps и открываются DevTools — можно ставить breakpoints прямо в исходном TypeScript-коде.

## Советы

### Изоляция тестов

Каждый тест должен быть независимым. Используйте `beforeEach`/`afterEach` для настройки и очистки:

```ts
describe('TodoList', () => {
  let list: TodoList;

  beforeEach(() => {
    list = new TodoList();
  });

  afterEach(() => {
    list.destroy();
  });

  it('should add item', () => {
    list.add('Buy milk');
    assert.equal(list.getCount(), 1);
  });

  it('should start empty', () => {
    assert.equal(list.getCount(), 0);
  });
});
```

### Организация тестов

Группируйте тесты по функциональности:

```ts
describe('UserService', () => {
  describe('create', () => {
    it('should create user with valid data', () => { /* ... */ });
    it('should throw on duplicate email', () => { /* ... */ });
  });

  describe('update', () => {
    it('should update user name', () => { /* ... */ });
    it('should not allow empty name', () => { /* ... */ });
  });

  describe('delete', () => {
    it('should soft delete user', () => { /* ... */ });
  });
});
```
