# Стандарт ответов

API использует **три формы результата** — каждая для своего типа вызова. И **никогда не throw** в массовых операциях: все ошибки попадают в результат.

## Три формы

### `ChefResult<TDetails>` — массовые операции

Возвращается из `chef.build`, `chef.lint`, `chef.test`, `chef.typecheck`.

```ts
type ChefResult<TDetails> = {
  ok: boolean;                          // true ⇔ всё успешно
  command: string;                      // 'build' | 'lint' | ...
  extensions: ChefExtensionResult<TDetails>[];
  notFound: Array<{ name: string; code: string; reason: string }>;
  error?: ChefErrorPayload;             // фатальная ошибка операции в целом
  summary: {
    total: number;
    passed: number;
    failed: number;
    durationMs: number;
  };
};
```

### `ChefExtensionResult<TDetails>` — результат по одному расширению

Элементы массива `extensions[]` в `ChefResult`, а также возвращаемое значение `pkg.build()` / `pkg.lint()` / `pkg.test()` / `pkg.typecheck()`.

```ts
type ChefExtensionResult<TDetails> = {
  name: string;
  path: string;
  ok: boolean;
  durationMs: number;
  details?: TDetails;                   // специфика команды
  error?: ChefErrorPayload;             // ошибка по конкретному расширению
  warnings?: ChefErrorPayload[];        // предупреждения, не валящие сборку
};
```

Конкретный тип `TDetails` зависит от операции:
- `BuildDetails` — см. [Сборка](./build)
- `LintDetails` — см. [Линтинг](./lint)
- `TestDetails` — см. [Тесты](./test)
- `TypecheckDetails` — см. [Type-check](./typecheck)

### `ChefDataResult<TData>` — диагностика и резолв

Возвращается из `chef.resolve` и всех `chef.diag.*`.

```ts
type ChefDataResult<TData> = {
  ok: boolean;
  command: string;                      // 'diag.top-used', 'resolve' и т.п.
  data?: TData;
  error?: ChefErrorPayload;
  durationMs: number;
};
```

У этой формы нет ни `extensions[]`, ни `notFound[]` — это просто запрос данных.

## ChefErrorPayload

Единый формат ошибки в API:

```ts
type ChefErrorPayload = {
  code: string;                         // код из таблицы CF (например, 'CF1006')
  message: string;
  file?: string;
  line?: number;
  column?: number;
};
```

`code` использует общую таблицу [`CF`](./errors). Все ошибки и предупреждения — даже из Rollup, ESLint, TypeScript — нормализованы к одному формату.

## Три уровня ошибок

### 1. Фатальная — `result.error`

Окружение не готово: невалидный `cwd`, не нашёлся корень проекта, не удалось прочитать конфиг проекта. Массив `extensions` будет пустой.

```ts
const result = await chef.build({ cwd: '/nonexistent', extension: 'main.core' });

if (result.error)
{
  console.error(`${result.error.code}: ${result.error.message}`);
  // CF5005: Working directory does not exist
}
```

### 2. Резолвинг — `result.notFound[]`

Указанный паттерн не нашёл ни одного расширения. Не считается фатальной ошибкой — другие паттерны могли успешно зарезолвиться.

```ts
const result = await chef.build({ extension: ['main.core', 'unknown.foo'] });

for (const missing of result.notFound)
{
  console.warn(`Не найдено: ${missing.name} (${missing.code})`);
}
```

### 3. По расширению — `extensions[].error`

Сборка/лит/тест **этого конкретного** расширения упали. Остальные продолжают выполняться.

```ts
const result = await chef.build({ extension: 'ui.*' });

for (const ext of result.extensions)
{
  if (!ext.ok)
  {
    console.error(`✗ ${ext.name}: ${ext.error?.message}`);
  }
}
```

## Принцип: никогда не throw

API **гарантированно** не бросает исключений на массовых операциях. Любая ошибка — в `result`:

```ts
// Можно безопасно делать так — try/catch не нужен
const result = await chef.build({ extension: 'main.core' });

if (!result.ok)
{
  // обработать
}
```

Это удобно для CI: одна точка проверки, единый формат, никаких сюрпризов.

## Исключение: методы Package

Геттеры и инспекции на уровне `Package` (`pkg.getDependencies()`, `pkg.findCircularImports()` и т.п.) — **могут** бросать исключения, как обычные JS-библиотеки. У них нет места под `error`-поле, и у пакета уже подразумевается, что он существует.

```ts
const pkg = await chef.getPackage('main.core');
if (!pkg)
{
  return;
}

try
{
  const deps = await pkg.getDependencies();
}
catch (error)
{
  // редкий случай: упал парсер config.php или Rollup при анализе entry point
}
```

**Действия** (`pkg.build()`, `pkg.lint()`, `pkg.test()`, `pkg.typecheck()`) — наоборот, не throw'ят. Возвращают `ChefExtensionResult` с `error?` внутри.

`chef.findPackages()` throw'ит `ChefError(CF.OPTION_DENIED)` если переданы и `extension`, и `path` — это явная usage-ошибка. На невалидный `cwd` — возвращает пустой массив.

## ok: точно когда true

Для `ChefResult`:

```ts
result.ok === !result.error
          && result.notFound.length === 0
          && result.extensions.every((ext) => ext.ok)
```

Для `ChefExtensionResult`:

```ts
ext.ok === !ext.error
```

Предупреждения (`warnings[]`) не влияют на `ok`. Если предупреждение должно валить сборку в вашем CI — проверяйте `warnings.length` руками.

## Дальше

- [Коды ошибок](./errors) — какие `CF`-коды встречаются и что они значат.
- [CLI `--json`](./json-cli) — как тот же формат получить из CLI.
