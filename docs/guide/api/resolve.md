# Resolve

`chef.resolve(options)` — резолвит паттерны в список расширений без выполнения каких-либо действий. Полезно, чтобы проверить, какие расширения матчатся, прежде чем что-то с ними делать.

Возвращает [`ChefDataResult<ResolveData>`](./response-format).

## Сигнатура

```ts
chef.resolve(options?: ResolveOptions): Promise<ChefDataResult<ResolveData>>
```

## Опции

| Поле        | Тип                  | Описание                                          |
|-------------|----------------------|---------------------------------------------------|
| `extension` | `string \| string[]` | Имена/паттерны для резолва.                       |
| `path`      | `string`             | Директория для обхода.                            |
| `cwd`       | `string`             | Рабочая директория. По умолчанию `process.cwd()`. |

Без `extension` и `path` — возвращается список всех расширений проекта. `extension` и `path` взаимоисключающие.

## Структура `ResolveData`

```ts
type ResolveData = {
  found: Array<{ name: string; path: string }>;
  notFound: Array<{ name: string; code: string; reason: string }>;
};
```

## Пример: проверка перед действием

```ts
import { chef } from '@bitrix/chef';

const r = await chef.resolve({ extension: 'ui.bbcode.*' });

if (!r.ok)
{
  for (const missing of r.data?.notFound ?? [])
  {
    console.warn(`Не найдено: ${missing.name}`);
  }
}

console.log(`Найдено ${r.data?.found.length} расширений`);
for (const ext of r.data?.found ?? [])
{
  console.log(`  ${ext.name} → ${ext.path}`);
}
```

## Пример: список расширений модуля

```ts
const r = await chef.resolve({ extension: 'crm.timeline.**' });
const names = r.data?.found.map((ext) => ext.name) ?? [];
console.log(names);
```

## Альтернатива через `Package`

Если нужны не просто имена/пути, а полноценные объекты для дальнейшей работы — используйте `chef.findPackages()`:

```ts
const packages = await chef.findPackages({ extension: 'ui.bbcode.*' });
for (const pkg of packages)
{
  console.log(pkg.getName(), pkg.getPath(), pkg.isTypeScript());
}
```

См. [страницу Package](./package#findpackages).
