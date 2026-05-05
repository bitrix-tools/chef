# Сборка

`chef.build(options)` — собирает указанные расширения через Rollup. Возвращает [`ChefResult<BuildDetails>`](./response-format) — единый формат массовых операций.

## Сигнатура

```ts
chef.build(options?: BuildOptions): Promise<ChefResult<BuildDetails>>
```

## Опции

| Поле        | Тип                  | Описание                                                                          |
|-------------|----------------------|-----------------------------------------------------------------------------------|
| `extension` | `string \| string[]` | Имена/паттерны расширений: `'main.core'`, `'ui.*'`, `['a', 'b']`.                 |
| `path`      | `string`             | Директория для обхода (абсолютная или относительно `cwd`).                        |
| `cwd`       | `string`             | Рабочая директория. По умолчанию `process.cwd()`.                                 |
| `force`     | `boolean`            | Игнорировать `chef.config` запреты на опции. По умолчанию `false`.                |

Если ни `extension`, ни `path` не заданы — собираются все расширения проекта. `extension` и `path` взаимоисключающие — задавайте одно из двух.

## Структура `BuildDetails`

```ts
type BuildDetails = {
  bundles: Array<{ fileName: string; size: number }>;  // выходные файлы
  dependencies: string[];                              // обнаруженные зависимости
  standalone: boolean;                                 // standalone-режим
};
```

Помимо этого в `extensions[i]` могут быть:

- `error` — критическая ошибка сборки (Rollup упал, файл не найден и т.п.)
- `warnings[]` — предупреждения с кодами `CF1xxx` (циклы, неиспользуемые экспорты, baseline-предупреждения и др.)

## Пример: собрать одно расширение

```ts
import { chef } from '@bitrix/chef';

const result = await chef.build({ extension: 'main.core' });

if (!result.ok)
{
  console.error('Сборка не прошла');
  process.exit(1);
}
```

## Пример: собрать несколько по паттерну

```ts
const result = await chef.build({ extension: 'ui.bbcode.*' });

console.log(`Собрано: ${result.summary.passed}/${result.summary.total}`);
console.log(`Время: ${(result.summary.durationMs / 1000).toFixed(2)}s`);
```

## Пример: обработать ошибки

```ts
const result = await chef.build({ extension: ['main.core', 'crm.timeline'] });

for (const ext of result.extensions)
{
  if (!ext.ok)
  {
    console.log(`✗ ${ext.name}: ${ext.error?.message}`);
    if (ext.error?.file)
    {
      console.log(`  ${ext.error.file}:${ext.error.line}:${ext.error.column}`);
    }
  }
}

for (const missing of result.notFound)
{
  console.log(`? ${missing.name} — ${missing.reason}`);
}
```

## Пример: предупреждения отдельно

```ts
const result = await chef.build({ extension: 'ui.*' });

for (const ext of result.extensions)
{
  for (const warning of ext.warnings ?? [])
  {
    console.log(`[${warning.code}] ${ext.name}: ${warning.message}`);
  }
}
```

## Сборка одного через `Package`

Если у вас уже есть объект расширения, удобнее вызывать `pkg.build()` — возвращает `ChefExtensionResult<BuildDetails>` (отдельное расширение, без обёртки в массовый результат):

```ts
const pkg = await chef.getPackage('main.core');
if (!pkg)
{
  return;
}

const result = await pkg.build({ force: true });
if (!result.ok)
{
  console.error(result.error?.message);
}
```

См. [страницу Package](./package#build).
