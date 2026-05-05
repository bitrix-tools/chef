# Тесты

`chef.test(options)` — запускает unit и/или e2e тесты в указанных расширениях через Playwright. Возвращает [`ChefResult<TestDetails>`](./response-format).

## Сигнатура

```ts
chef.test(options?: TestOptions): Promise<ChefResult<TestDetails>>
```

## Опции

| Поле        | Тип                                         | Описание                                                |
|-------------|---------------------------------------------|---------------------------------------------------------|
| `extension` | `string \| string[]`                        | Имена/паттерны расширений.                              |
| `path`      | `string`                                    | Директория для обхода.                                  |
| `cwd`       | `string`                                    | Рабочая директория. По умолчанию `process.cwd()`.       |
| `kind`      | `'unit' \| 'e2e' \| 'all'`                  | Что запускать. По умолчанию `'all'`.                    |
| `headed`    | `boolean`                                   | Запуск в headed-режиме браузера.                        |
| `debug`     | `boolean`                                   | Debug-режим (медленнее, больше логов).                  |
| `grep`      | `string`                                    | Запускать только тесты, попадающие под шаблон.          |
| `browsers`  | `Array<'chromium' \| 'firefox' \| 'webkit'>`| Конкретные браузеры (для unit-тестов).                  |
| `file`      | `string`                                    | Конкретный тестовый файл.                               |
| `project`   | `string \| string[]`                        | Playwright-проекты для e2e.                             |

Без `extension` и `path` — прогоняются тесты всех расширений проекта. `extension` и `path` взаимоисключающие.

## Структура `TestDetails`

```ts
type TestDetails = {
  runs: TestRunDetails[];     // отдельный прогон на каждый kind/browser
  passed: number;
  failed: number;
  skipped: number;
};

type TestRunDetails = {
  kind: 'unit' | 'e2e';
  passed: number;
  failed: number;
  skipped: number;
  failures: Array<{
    suite: string[];
    title: string;
    message: string;
    stack?: string;
  }>;
};
```

Каждый запуск (unit на каждый браузер, e2e отдельно) — отдельный элемент в `runs`. Цифры на верхнем уровне — суммы по всем `runs`.

::: warning
Если у расширения нет тестов выбранного типа — `runs` будет пустым, а `passed`/`failed`/`skipped` равны `0`. Чтобы отличить «прошло 0 тестов» от «тестов не было», проверяйте `runs.length > 0` или сначала вызывайте `pkg.hasUnitTests()` / `pkg.hasEndToEndTests()`.
:::

## Пример: прогнать unit-тесты

```ts
import { chef } from '@bitrix/chef';

const result = await chef.test({
  extension: 'main.core',
  kind: 'unit',
});

if (!result.ok)
{
  process.exit(1);
}
```

## Пример: разобрать failures

```ts
const result = await chef.test({ extension: 'ui.*', kind: 'unit' });

for (const ext of result.extensions)
{
  if (ext.ok || !ext.details) continue;

  console.log(`\n${ext.name}: ${ext.details.failed} упавших тестов`);

  for (const run of ext.details.runs)
  {
    for (const failure of run.failures)
    {
      const path = [...failure.suite, failure.title].join(' › ');
      console.log(`  ✗ ${path}`);
      console.log(`    ${failure.message}`);
    }
  }
}
```

## Пример: только определённые браузеры

```ts
const result = await chef.test({
  extension: 'main.core',
  kind: 'unit',
  browsers: ['chromium'],
  grep: 'BX.Type',
});
```

## Пример: e2e

```ts
const result = await chef.test({
  extension: 'ui.bbcode.editor',
  kind: 'e2e',
  headed: true,
});
```

## Тесты одного через `Package`

```ts
const pkg = await chef.getPackage('main.core');
if (!pkg)
{
  return;
}

if (await pkg.hasUnitTests())
{
  const result = await pkg.test({ kind: 'unit' });
  console.log(`${result.details?.passed} passed`);
}
```

См. [страницу Package](./package#test).
