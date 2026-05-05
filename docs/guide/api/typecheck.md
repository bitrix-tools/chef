# Type-check

`chef.typecheck(options)` — проверяет типы в TypeScript-расширениях через `tsc`. Возвращает [`ChefResult<TypecheckDetails>`](./response-format).

JavaScript-расширения автоматически пропускаются (status `skipped` с причиной).

## Сигнатура

```ts
chef.typecheck(options?: TypecheckOptions): Promise<ChefResult<TypecheckDetails>>
```

## Опции

| Поле        | Тип                  | Описание                                                              |
|-------------|----------------------|-----------------------------------------------------------------------|
| `extension` | `string \| string[]` | Имена/паттерны расширений.                                            |
| `path`      | `string`             | Директория для обхода.                                                |
| `cwd`       | `string`             | Рабочая директория. По умолчанию `process.cwd()`.                     |
| `files`     | `string[]`           | Конкретные файлы (относительно корня расширения).                     |
| `exclude`   | `string[]`           | Файлы для исключения (относительно корня расширения).                 |

Без `extension` и `path` — проверяются все TypeScript-расширения проекта. `extension` и `path` взаимоисключающие.

## Структура `TypecheckDetails`

```ts
type TypecheckDetails = {
  skipped: boolean;
  skipReason?: string;
  errors: Array<{
    code?: string;
    message: string;
    file?: string;
    line?: number;
    column?: number;
    frame?: string;
  }>;
};
```

`code` — диагностический код TypeScript (например, `TS2322`). `frame` — фрагмент кода вокруг места ошибки, если доступен.

## Структура `summary`

Помимо общих полей (счётчики расширений), `chef.typecheck` добавляет агрегаты по ошибкам типов и пропускам по всему набору:

```ts
type TypecheckApiResult['summary'] = {
  total: number;        // сколько расширений было обработано
  passed: number;       // сколько прошло проверку (включая JS-расширения, помеченные skipped)
  failed: number;       // сколько с ошибками типов
  durationMs: number;

  // специфика typecheck
  errorCount: number;     // суммарно ошибок типов по всем расширениям
  skippedCount: number;   // сколько расширений пропущено (не TypeScript)
};
```

JS-расширения попадают в `passed` с флагом `details.skipped: true` и засчитываются в `skippedCount`.

## Пример: проверить и упасть на ошибках

```ts
import { chef } from '@bitrix/chef';

const result = await chef.typecheck({ extension: 'ui.*' });

if (!result.ok)
{
  process.exit(1);
}
```

## Пример: подробный вывод

```ts
const result = await chef.typecheck({ extension: 'ui.*' });

for (const ext of result.extensions)
{
  if (!ext.details) continue;

  if (ext.details.skipped)
  {
    console.log(`- ${ext.name} (${ext.details.skipReason})`);
    continue;
  }

  if (ext.details.errors.length === 0)
  {
    console.log(`✓ ${ext.name}`);
    continue;
  }

  console.log(`\n✗ ${ext.name}`);
  for (const err of ext.details.errors)
  {
    const loc = err.file ? `${err.file}:${err.line}:${err.column}` : '';
    console.log(`  ${err.code ?? ''} ${loc}`);
    console.log(`    ${err.message}`);
  }
}
```

## Type-check одного через `Package`

```ts
const pkg = await chef.getPackage('main.core');
if (!pkg)
{
  return;
}

if (pkg.isTypeScript())
{
  const result = await pkg.typecheck();
  console.log(`Ошибок: ${result.details?.errors.length ?? 0}`);
}
```

См. [страницу Package](./package#typecheck).
