# Сценарные тесты

Сценарные тесты проверяют поведение, в котором участвует **сразу несколько расширений** — например, пользователь авторизуется, проходит по страницам портала, открывает мессенджер и отправляет сообщение. Такой сценарий не привязан к одному расширению, поэтому тесты живут на уровне модуля, а не внутри `install/js/...`.

Технически это обычные E2E-тесты на [Playwright Test API](https://playwright.dev/docs/api/class-test) — те же импорты, фикстуры и API, что и в [E2E-тестах расширений](/guide/testing-e2e). Отличается только расположение и команда запуска.

## Структура

Сценарные тесты лежат в директории `tests/chef/e2e/` модуля:

```
# Репозиторий исходников модулей
crm/
└── tests/
    └── chef/
        └── e2e/
            ├── portal-navigation.spec.ts
            └── messenger-send-message.spec.ts

# Установленный Bitrix
local/modules/crm/
└── tests/
    └── chef/
        └── e2e/
            └── portal-navigation.spec.ts
```

::: tip
На установленном Bitrix сценарные тесты ищутся только в `local/modules/<module>/`. Системная директория `bitrix/` доступна только для чтения и не используется.
:::

## Запуск

```bash
# Сценарные тесты конкретного модуля
chef test module crm

# Несколько модулей за один запуск
chef test module crm sale

# Модуль из текущей директории (если имя не указано)
chef test module
```

Подкоманда `module` поддерживает те же параметры, что и `chef test e2e`:

```bash
chef test module crm --headed                 # С видимым окном браузера
chef test module crm --debug                  # Отладка с DevTools и sourcemaps
chef test module crm --grep "messenger"       # Фильтр по имени теста
chef test module crm --project chromium       # Конкретный браузер
chef test module crm -w                        # Watch-режим
```

Без `--project` тесты прогоняются во всех браузерах из `playwright.config.ts`. Если у модуля нет тестов, он помечается как `skipped` и не считается пройденным.

## Пример

Авторизованный обход страниц портала с использованием фикстуры `ui.test.e2e.auth` — вход выполняется один раз на прогон и переиспользуется во всех тестах:

```ts
import { test, expect } from 'ui.test.e2e.auth';

test.describe('Навигация по порталу (авторизованный)', () => {
  const pages = [
    { name: 'Главная', url: '/' },
    { name: 'Чат и звонки', url: '/online/' },
    { name: 'Живая лента', url: '/stream/' },
  ];

  for (const { name, url } of pages)
  {
    test(`открывает «${name}» (${url})`, async ({ page }) => {
      const response = await page.goto(url);

      expect(response?.status()).toBeLessThan(400);
      await expect(page).not.toHaveURL(/\/(auth|login)/);
    });
  }
});
```

Подготовка тестового окружения (`playwright.config.ts`, `.env.test`, фикстуры авторизации) описана в разделе [Тестирование](/guide/testing) и [E2E-тесты](/guide/testing-e2e).
