# Diag

`chef.diag.*` — набор диагностических функций, работающих над **набором расширений**. Каждая возвращает [`ChefDataResult<T>`](./response-format) — простую обёртку с `data` и `error`.

Для аналогов на уровне одного расширения смотрите [Package](./package#diagnostics).

## Подкоманды

| Метод                      | Что делает                                                          | Тип `data`                            |
|----------------------------|---------------------------------------------------------------------|---------------------------------------|
| `chef.diag.topUsed`        | Самые популярные расширения — на кого больше всего ссылаются        | `Array<{ name; dependents }>`         |
| `chef.diag.topDeps`        | Расширения с наибольшим числом прямых зависимостей                  | `Array<{ name; count }>`              |
| `chef.diag.topBundleSize`  | Самые тяжёлые бандлы                                                | `Array<{ name; js; css; assets; total }>` |
| `chef.diag.unusedDeps`     | Расширения с неиспользуемыми зависимостями (полный анализ)          | `Array<{ name; unused: string[] }>`   |
| `chef.diag.circularDeps`   | Циклические зависимости между расширениями (через `config.php rel`) | `Array<{ name; cycles: string[][] }>` |
| `chef.diag.circularImports`| Циклы импортов внутри исходников (между файлами)                    | `Array<{ name; cycles: string[][] }>` |

## Общие опции

Все методы принимают:

| Поле        | Тип                  | Описание                                                          |
|-------------|----------------------|-------------------------------------------------------------------|
| `cwd`       | `string`             | Рабочая директория. По умолчанию `process.cwd()`.                 |
| `extension` | `string \| string[]` | Ограничить набор расширений (если не указано — все в проекте).    |
| `path`      | `string`             | Директория для сканирования (если не указано — корень проекта).   |

`extension` и `path` взаимоисключающие — задавайте одно из двух.

Кроме того, методы с рейтингом (`topUsed`, `topDeps`, `topBundleSize`, `unusedDeps`) принимают `limit?: number`.

`topBundleSize` дополнительно принимает `sortBy?: 'js' | 'css' | 'assets' | 'total'`.

## Пример: топ-10 популярных

```ts
import { chef } from '@bitrix/chef';

const r = await chef.diag.topUsed({ limit: 10 });

for (const item of r.data ?? [])
{
  console.log(`${item.name}: ${item.dependents} зависимых`);
}
```

## Пример: топ-5 тяжёлых по JS

```ts
const r = await chef.diag.topBundleSize({ limit: 5, sortBy: 'js' });

for (const item of r.data ?? [])
{
  console.log(`${item.name}: js ${(item.js / 1024).toFixed(1)} KB`);
}
```

## Пример: найти все циклы

```ts
const r = await chef.diag.circularDeps();

for (const ext of r.data ?? [])
{
  console.log(`\n${ext.name}:`);
  for (const cycle of ext.cycles)
  {
    console.log(`  ${cycle.join(' → ')}`);
  }
}
```

## Пример: ограничить набор паттерном

```ts
const r = await chef.diag.unusedDeps({ extension: 'ui.*', limit: 20 });
```

## Что считается «использованием» в `unusedDeps`

`chef.diag.unusedDeps` смотрит:

- `import ... from 'extension.name'` и side-effect `import 'extension.name'`
- `Reflection.getClass('BX.X.Y')`, `Runtime.getClass('BX.X.Y')`
- Прямые обращения вида `BX.X.Y`, сопоставленные с экспортами других расширений (через `exportedGlobals`)

`BX.loadExtension` / `Runtime.loadExtension` **не считаются** — это динамическая загрузка без объявления зависимости.

Упрощённый, но быстрый аналог на уровне одного расширения — `pkg.findUnusedDependencies()`. Он смотрит только на `import`-выражения, без namespace-анализа.

## Diag для одного расширения

Когда нужны те же проверки на одном пакете — используйте методы `Package`:

```ts
const pkg = await chef.getPackage('main.core');
if (!pkg)
{
  return;
}

await pkg.findCircularDependencies();    // string[][]
await pkg.findCircularImports();         // string[][]
await pkg.findUnusedDependencies();      // string[]
await pkg.getHeaviestDependencies();     // топ зависимостей по весу
```

См. [страницу Package](./package#diagnostics).
