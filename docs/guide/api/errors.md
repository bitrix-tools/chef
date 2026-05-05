# Коды ошибок в API

Все ошибки и предупреждения в API имеют код из таблицы `CF` chef. Полный список с описанием — на странице [Коды ошибок](../errors). Здесь — те, которые чаще всего встречаются именно в результатах API.

## Импорт констант

```ts
import { CF, type DiagnosticCode } from '@bitrix/chef';

if (result.error?.code === CF.PROJECT_ROOT_NOT_FOUND)
{
  // ...
}
```

## Окружение (CF5xxx)

| Код                          | Когда возникает                                                          |
|------------------------------|--------------------------------------------------------------------------|
| `CF.OUTSIDE_PROJECT_ROOT`    | `cwd` указывает на путь вне корня проекта.                               |
| `CF.PROJECT_ROOT_NOT_FOUND`  | Не удалось определить тип/корень проекта Bitrix из указанного `cwd`.     |
| `CF.INVALID_CWD`             | Указанная директория не существует.                                      |

Эти коды попадают в `result.error` (фатальная ошибка операции).

## Резолвинг (CF2xxx)

| Код                       | Когда возникает                                       |
|---------------------------|-------------------------------------------------------|
| `CF.NOT_FOUND`            | Расширение по указанному имени/паттерну не найдено.   |
| `CF.PACKAGE_PROTECTED`    | Расширение помечено `protected` — пропущено.          |

Попадают в `result.notFound[]` или `result.extensions[].error`.

## Сборка (CF1xxx)

Самые частые коды в `extensions[].warnings` и `extensions[].error` для `chef.build`:

| Код                            | Что значит                                            |
|--------------------------------|-------------------------------------------------------|
| `CF.CIRCULAR_DEPENDENCY`       | Циклическая зависимость файлов внутри расширения.     |
| `CF.UNRESOLVED_IMPORT`         | Не удалось разрешить импорт.                          |
| `CF.MISSING_EXPORT`            | Импортируется экспорт, которого нет.                  |
| `CF.UNUSED_EXTERNAL_IMPORT`    | Импорт внешнего модуля, не используется.              |
| `CF.SYNTAX_ERROR`              | Синтаксическая ошибка.                                |
| `CF.MINIFICATION_ERROR`        | Сбой минификатора.                                    |
| `CF.BASELINE_JS_UNSUPPORTED`   | Использована JS-фича, не входящая в targets.          |
| `CF.BASELINE_CSS_UNSUPPORTED`  | Использована CSS-фича, не входящая в targets.         |
| `CF.UNEXPECTED_BUILD_ERROR`    | Непредвиденная ошибка Rollup или плагинов.            |

## Лит (CF4xxx)

| Код                | Что значит                                              |
|--------------------|---------------------------------------------------------|
| `CF.LINT_FAILED`   | Лит нашёл хотя бы одну ошибку. В `details.files` — детали. |

## Тесты (CF3xxx)

| Код                        | Что значит                                            |
|----------------------------|-------------------------------------------------------|
| `CF.TEST_FAILED`           | Хотя бы один тест упал.                               |
| `CF.PLAYWRIGHT_ERROR`      | Ошибка запуска Playwright (например, нет браузеров). |
| `CF.UNKNOWN_BROWSER`       | Запрошен неизвестный браузер.                         |
| `CF.PLAYWRIGHT_CONFIG_NOT_FOUND` | Не найден `playwright.config`.                  |
| `CF.NO_E2E_TESTS`          | E2E-тестов нет.                                       |

## Type-check

В `details.errors[i].code` приходит код TypeScript (`TS2322`, `TS2304` и т.п.) — именно как его выдаёт компилятор. Помимо этого, на уровне `extensions[].error` используется:

| Код                  | Что значит                                              |
|----------------------|---------------------------------------------------------|
| `CF.TS_TYPE_ERROR`   | Type-check нашёл ошибки. В `details.errors` — детали.   |

## Внутренние (CF9xxx)

| Код                          | Когда возникает                                         |
|------------------------------|---------------------------------------------------------|
| `CF.PACKAGE_READ_ERROR`      | Не удалось прочитать расширение или его конфиг.         |
| `CF.UNCAUGHT_EXCEPTION`      | Непредвиденное исключение, нормализованное в payload.   |

## Пример: ветвление по коду

```ts
import { chef, CF } from '@bitrix/chef';

const result = await chef.build({ extension: 'main.core' });

if (result.error)
{
  switch (result.error.code)
  {
    case CF.PROJECT_ROOT_NOT_FOUND:
      console.error('Не похоже на проект Bitrix');
      break;
    case CF.INVALID_CWD:
      console.error('Указан несуществующий путь');
      break;
    default:
      console.error(result.error.message);
  }
  process.exit(1);
}
```

## Полный список

Все коды chef описаны на главной странице [Коды ошибок](../errors). Если в API встретился код, не попавший в таблицы выше — это нормально, он есть в общей таблице.
