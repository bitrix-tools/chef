# Линтинг

`chef.lint(options)` — запускает ESLint по исходникам указанных расширений. Возвращает [`ChefResult<LintDetails>`](./response-format).

## Сигнатура

```ts
chef.lint(options?: LintOptions): Promise<ChefResult<LintDetails>>
```

## Опции

| Поле        | Тип                  | Описание                                                                |
|-------------|----------------------|-------------------------------------------------------------------------|
| `extension` | `string \| string[]` | Имена/паттерны расширений.                                              |
| `path`      | `string`             | Директория для обхода.                                                  |
| `cwd`       | `string`             | Рабочая директория. По умолчанию `process.cwd()`.                       |
| `fix`       | `boolean`            | Автоматически исправлять то, что можно. По умолчанию `false`.           |
| `files`     | `string[]`           | Конкретные файлы (glob-паттерны относительно `src/`).                   |
| `cache`     | `boolean`            | Использовать кеш ESLint. По умолчанию `true`.                           |
| `exclude`   | `string[]`           | Glob-паттерны для исключения файлов.                                    |

Без `extension` и `path` — линтуются все расширения проекта. `extension` и `path` взаимоисключающие.

## Структура `LintDetails`

```ts
type LintDetails = {
  errorCount: number;
  warningCount: number;
  skipped: boolean;
  skipReason?: string;
  files: Array<{
    filePath: string;
    messages: Array<{
      ruleId: string | null;
      severity: 'error' | 'warning';
      line: number;
      column: number;
      message: string;
    }>;
  }>;
};
```

В `details.files` попадают только те файлы, у которых есть хотя бы одно сообщение. Если ошибок ноль — массив пустой.

## Пример: проверить и упасть на ошибках

```ts
import { chef } from '@bitrix/chef';

const result = await chef.lint({ extension: 'ui.*' });

if (!result.ok)
{
  console.error(`Лит нашёл проблемы в ${result.summary.failed} расширениях`);
  process.exit(1);
}
```

## Пример: подробный отчёт

```ts
const result = await chef.lint({ extension: 'ui.*' });

for (const ext of result.extensions)
{
  if (!ext.details) continue;

  if (ext.details.errorCount === 0 && ext.details.warningCount === 0)
  {
    continue;
  }

  console.log(`\n${ext.name}: ${ext.details.errorCount} ошибок, ${ext.details.warningCount} предупреждений`);

  for (const file of ext.details.files)
  {
    for (const msg of file.messages)
    {
      const sign = msg.severity === 'error' ? '✗' : '!';
      console.log(`  ${sign} ${file.filePath}:${msg.line}:${msg.column}  ${msg.ruleId ?? '?'}  ${msg.message}`);
    }
  }
}
```

## Пример: автоисправление

```ts
const result = await chef.lint({
  extension: 'ui.bbcode.*',
  fix: true,
});

console.log(`Исправлено где возможно. Осталось ошибок: ${result.summary.failed}`);
```

## Линтинг одного через `Package`

```ts
const pkg = await chef.getPackage('main.core');
if (!pkg)
{
  return;
}

const result = await pkg.lint({ fix: true });
if (!result.ok)
{
  console.log(`${result.details?.errorCount} ошибок осталось после fix`);
}
```

См. [страницу Package](./package#lint).
