# Расширение (Package)

`Package` — фасад для тонкой работы с одним расширением. Получив объект, вы можете читать его метаданные, конфиги, зависимости, размеры, искать проблемы, делать снимки и запускать действия (build/lint/test/typecheck).

## Получение

### `chef.getPackage`

```ts
chef.getPackage(name: string, options?: { cwd?: string }): Promise<Package | null>
```

Резолвит одно расширение по имени. Возвращает `null`, если расширение не найдено или `cwd` не находится внутри проекта Bitrix.

```ts
import { chef } from '@bitrix/chef';

const pkg = await chef.getPackage('main.core');
if (!pkg)
{
  console.error('main.core не найдено');
  process.exit(1);
}
```

### `chef.findPackages`

```ts
chef.findPackages(options?: {
  cwd?: string;
  extension?: string | string[];
  path?: string;
}): Promise<Package[]>
```

Возвращает массив расширений: по имени/паттерну, по директории, либо все в проекте. Никогда не бросает исключений — пустой массив на ошибку окружения.

```ts
const ui = await chef.findPackages({ extension: 'ui.*' });
const inDir = await chef.findPackages({ path: './modules/ui' });
const all = await chef.findPackages();
```

## Группы методов

- [Метаданные](#metadata) — имя, путь, namespace, тип
- [Файловые пути](#paths) — точка входа, выходы, исходники
- [Конфиги](#configs) — bundle.config, config.php
- [Зависимости](#dependencies) — direct, tree, flattened
- [Тесты](#tests) — наличие unit/e2e
- [Размеры](#sizes) — own, dependencies, total, heaviest
- [Поиск проблем](#diagnostics) — циклы, неиспользуемые
- [Снимок](#snapshot) — `PackageSnapshot` для своих анализаторов
- [Действия](#actions) — build, lint, test, typecheck

## <a id="metadata"></a> Метаданные

```ts
pkg.getName();         // 'main.core'
pkg.getPath();         // абсолютный путь к директории
pkg.getModuleName();   // 'main'
pkg.getNamespace();    // 'BX.Main' — из bundle.config 'namespace'
pkg.isTypeScript();    // true если точка входа .ts
```

## <a id="paths"></a> Файловые пути

```ts
pkg.getInputPath();        // абсолютный путь к точке входа
pkg.getOutputJsPath();     // куда пишется собранный JS
pkg.getOutputCssPath();    // куда пишется собранный CSS
pkg.getSourceFiles();      // string[] — все .js/.ts в src/
```

## <a id="configs"></a> Конфиги

```ts
const bundleConfig = pkg.getBundleConfig();    // BundleConfigManager
const namespace = bundleConfig.get('namespace');
const targets = bundleConfig.get('targets');

const phpConfig = pkg.getPhpConfig();          // PhpConfigManager
const rel = phpConfig.get('rel');              // массив зависимостей из config.php
const includes = phpConfig.get('includes');    // includes-файлы
```

`BundleConfigManager` и `PhpConfigManager` — внутренние классы chef, экспортированные как типы. Их форма стабильна, но методы лучше использовать только на чтение (`get`/`has`).

## <a id="dependencies"></a> Зависимости

```ts
await pkg.getDependencies();             // string[] — прямые
await pkg.getDependenciesTree();         // DependencyNode[] — дерево
await pkg.getFlattenedDependencies();    // плоский список всех транзитивных
await pkg.getDependenciesTreeSize();     // количество уникальных deps в дереве
```

`DependencyNode`:

```ts
type DependencyNode = {
  name: string;
  visited?: boolean;
  children: DependencyNode[];
  bundlesSize?: { js: number; css: number };  // если withSize: true
};
```

С опцией `withSize: true` дерево заполняется размерами каждого узла:

```ts
const tree = await pkg.getDependenciesTree({ withSize: true });
```

## <a id="tests"></a> Тесты

```ts
await pkg.hasUnitTests();       // boolean
await pkg.hasEndToEndTests();   // boolean
```

Обходят `test/unit/` и `test/e2e/` (и legacy `test/`) и проверяют наличие `*.test.ts`/`*.spec.ts`.

## <a id="sizes"></a> Размеры

```ts
pkg.getBundleSize();
// { js: 331942, css: 0, assets: 914, total: 332856 }

await pkg.getDependenciesSize();
// { js: 1234567, css: 12345, assets: 4321 } — суммарно по всем транзитивным deps

await pkg.getTotalTransferredSize();
// { js, css, assets, total } — own + tree
```

### `getHeaviestDependencies`

Топ зависимостей по весу — что больше всего тянет это расширение:

```ts
await pkg.getHeaviestDependencies({ limit?: number; sortBy?: 'total' | 'js' | 'css' | 'assets' })
```

Возвращает:

```ts
Array<{
  name: string;
  js: number;
  css: number;
  assets: number;
  total: number;
}>
```

Пример:

```ts
const heavy = await pkg.getHeaviestDependencies({ limit: 10, sortBy: 'js' });

console.log(`\nТоп-10 по JS, тянутся через ${pkg.getName()}:`);
for (const dep of heavy)
{
  console.log(`  ${dep.name}: ${(dep.js / 1024).toFixed(1)} KB`);
}
```

## <a id="diagnostics"></a> Поиск проблем

```ts
await pkg.findCircularDependencies();    // string[][] — циклы между расширениями
await pkg.findCircularImports();         // string[][] — циклы между файлами внутри
await pkg.findUnusedDependencies();      // string[] — deps без import-выражений
```

### `findCircularDependencies`

Ищет прямые циклы по `config.php rel`: `A → A` (self-dep), `A → B → A` (mutual).

```ts
const cycles = await pkg.findCircularDependencies();
for (const cycle of cycles)
{
  console.log(cycle.join(' → '));
}
```

### `findCircularImports`

Парсит `import`/`export` с относительными путями (`./`, `../`) во всех исходниках расширения и строит граф файлов. Циклы возвращаются как массивы относительных путей.

```ts
const cycles = await pkg.findCircularImports();
console.log(`Найдено ${cycles.length} циклов`);
```

### `findUnusedDependencies`

**Упрощённый** анализ: смотрит только на `import`-выражения. Не ловит namespace-обращения вида `BX.Main.Foo`. Быстро.

Для **полного** анализа на уровне всего проекта используйте [`chef.diag.unusedDeps`](./diag).

## <a id="snapshot"></a> Снимок

Для своих анализаторов можно получить плоский объект с нужными полями:

```ts
const snapshot = await pkg.snapshot([
  'dependencies',
  'bundleSize',
  'exportedGlobals',
  'importedExtensions',
]);
```

`SnapshotField`:

```ts
type SnapshotField =
  | 'dependencies'
  | 'dependencyTreeSize'
  | 'bundleSize'
  | 'assetsSize'
  | 'totalSize'
  | 'bundleConfig'
  | 'exportedGlobals'
  | 'importedExtensions'
  | 'usedNamespaces';
```

Только запрошенные поля заполняются — это экономит время на больших проектах.

## <a id="actions"></a> Действия

Методы возвращают тот же `ChefExtensionResult<...>`, что и массовые `chef.build/lint/test/typecheck` для одного элемента — формат данных совпадает, обработка унифицирована.

### `build`

```ts
await pkg.build({ force?: boolean }): Promise<ChefExtensionResult<BuildDetails>>
```

```ts
const result = await pkg.build({ force: true });

if (!result.ok)
{
  console.error(result.error?.message);
}

console.log(`Bundles: ${result.details?.bundles.length}`);
console.log(`Warnings: ${result.warnings?.length ?? 0}`);
```

### `lint`

```ts
await pkg.lint({
  fix?: boolean;
  files?: string[];
  cache?: boolean;
  exclude?: string[];
}): Promise<ChefExtensionResult<LintDetails>>
```

### `test`

```ts
await pkg.test({
  kind?: 'unit' | 'e2e' | 'all';
  headed?: boolean;
  debug?: boolean;
  grep?: string;
  browsers?: BrowserType[];
  file?: string;
  project?: string | string[];
}): Promise<ChefExtensionResult<TestDetails>>
```

### `typecheck`

```ts
await pkg.typecheck({
  files?: string[];
  exclude?: string[];
}): Promise<ChefExtensionResult<TypecheckDetails>>
```

## Большой пример: свой отчёт по проекту

```ts
import { chef } from '@bitrix/chef';

const packages = await chef.findPackages({ extension: 'ui.*' });
const report: Array<{ name: string; size: number; cycles: number; deps: number }> = [];

for (const pkg of packages)
{
  const size = pkg.getBundleSize();
  const cycles = await pkg.findCircularImports();
  const deps = await pkg.getDependencies();

  report.push({
    name: pkg.getName(),
    size: size.total,
    cycles: cycles.length,
    deps: deps.length,
  });
}

report.sort((a, b) => b.size - a.size);
console.table(report);
```

