# Формат ответа

`--reporter json` использует **две формы ответа** в зависимости от природы команды.

## Общее: метаданные и поле `error`

Каждый ответ начинается с одинакового набора полей:

```jsonc
{
  "chefVersion": "1.10.0",   // версия chef
  "cwd": "/path/to/project", // рабочая директория, в которой запустили команду
  "success": true,           // итоговый успех
  "command": "build"         // 'build' | 'lint' | 'test' | 'typecheck' | 'diag.<sub>'
}
```

`error` появляется в корне **только** при катастрофическом сбое до того, как команда успела что-то выполнить (например, `cwd` не существует, не нашёлся корень проекта, конфликт опций):

```jsonc
{
  "success": false,
  "error": {
    "code": "CF5001",
    "message": "Working directory does not exist: /nope"
  },
  ...
}
```

Если команда успела дойти до работы с расширениями и упала на каком-то из них — `error` корня будет отсутствовать, конкретные ошибки попадут в `extensions[].errors[]`.

## Форма 1: операции (`build`, `lint`, `test`, `typecheck`)

```ts
type JsonOperationResult<TDetails, TSummaryExtras = {}> = {
  chefVersion: string;
  cwd: string;
  success: boolean;
  command: string;
  extensions: JsonExtensionResult<TDetails>[];
  notFound: { name: string; reason: string }[];
  summary: JsonSummary & TSummaryExtras;
  error?: JsonErrorPayload;
};
```

- `extensions[]` — результаты по каждому найденному расширению.
- `notFound[]` — имена/паттерны, которые не разрешились в существующие расширения. Не приводят к `success: false` сами по себе — потребитель решает, считать ли это ошибкой.
- `summary` — агрегаты по расширениям. Счётчики `total/passed/failed` всегда считают расширения. Агрегаты по «единицам внутри» (тестам, lint-сообщениям) живут в `summary.<command-specific>` (см. ниже).

### `JsonExtensionResult<TDetails>`

```ts
type JsonExtensionResult<TDetails> = {
  name: string;
  path: string;          // абсолютный путь к расширению
  success: boolean;
  durationMs: number;
  details: TDetails;     // зависит от команды — см. ниже
  errors: JsonErrorPayload[];
  warnings: JsonErrorPayload[];
};
```

### `JsonSummary`

```ts
type JsonSummary = {
  total: number;       // расширений всего
  passed: number;
  failed: number;
  durationMs: number;
  errorCount: number;  // суммарно по всем extensions[].errors
  warningCount: number;
};
```

Дополнительные поля у конкретных команд:

| Команда     | Дополнительные поля `summary`                                              |
|-------------|----------------------------------------------------------------------------|
| `build`     | —                                                                          |
| `lint`      | `fixedCount`                                                               |
| `test`      | `tests: { total, passed, failed, skipped }` — агрегат по самим тестам      |
| `typecheck` | `skippedCount` — количество расширений, пропущенных как не-TypeScript      |

### `JsonErrorPayload`

```ts
type JsonErrorPayload = {
  code: string;          // код из таблицы CF либо ESLint rule id
  message: string;
  file?: string;         // абсолютный путь, где есть локация
  line?: number;
  column?: number;
  frame?: string;        // фрагмент исходника с пометкой строки — для build/typecheck/test
};
```

### `details` по командам

#### `build`

```ts
type BuildDetails = {
  bundles: { file: string; size: number }[];  // file — относительный к extensions[].path
  dependencies: string[];
  standalone: boolean;
};
```

Пример:

```jsonc
{
  "name": "ui.buttons",
  "path": "/Users/.../ui/install/js/ui/buttons",
  "success": true,
  "durationMs": 3295,
  "details": {
    "bundles": [
      { "file": "ui.buttons.bundle.js", "size": 92007 },
      { "file": "ui.buttons.bundle.css", "size": 91087 }
    ],
    "dependencies": ["main.core", "ui.cnt"],
    "standalone": false
  },
  "errors": [],
  "warnings": [
    {
      "code": "CF1006",
      "message": "Circular dependency: src/index.js -> src/base-button.js -> src/index.js"
    }
  ]
}
```

#### `lint`

```ts
type LintDetails = {
  errorCount: number;
  warningCount: number;
  fixedCount: number;
  skipped: boolean;
  skipReason?: string;
};
```

Сами сообщения linter'а — в `errors[]` и `warnings[]` корня extension. Группировку по файлам делайте сами (`jq 'group_by(.file)'`).

#### `typecheck`

```ts
type TypecheckDetails = {
  skipped: boolean;       // true для не-TS расширений
  skipReason?: string;
  errorCount: number;
};
```

TS-ошибки — в `errors[]` корня extension, с полем `frame` (фрагмент исходника).

#### `test`

```ts
type TestDetails = {
  unit: TestKindDetails;
  e2e: TestKindDetails;
};

type TestKindDetails = {
  ran: boolean;
  skipReason?: string;
  durationMs: number;
  browsers: string[];      // 'chromium', 'firefox', 'webkit' — реальные имена
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  tests: TestEntry[];
  consoleLogs: { type: string; text: string }[];
};

type TestEntry = {
  suite: string[];                                  // путь suite через describe/context
  title: string;
  status: 'passed' | 'failed' | 'skipped';
  results: Record<string, BrowserTestResult>;       // ключ — имя браузера
};

type BrowserTestResult = {
  status: 'passed' | 'failed' | 'skipped';
  durationMs?: number;
  failure?: TestFailure;
};

type TestFailure = {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  frame?: string;                                   // фрагмент исходника с указателем
  diff?: { actual: unknown; expected: unknown };    // для assert.deepEqual и т.п.
};
```

По умолчанию unit-тесты прогоняются во **всех** браузерах из `playwright.config.ts`. `--project chromium` сужает до одного.

В корневом `extensions[].errors[]` для каждого упавшего теста создаётся запись с `frame`/`file`/`line`/`column` — без полного стек-трейса.

## Форма 2: отчёты (`diag.*`)

```ts
type JsonReportResult<TData> = {
  chefVersion: string;
  cwd: string;
  success: boolean;
  command: string;             // 'diag.top-used', 'diag.circular-deps', ...
  data: TData;                 // см. таблицу ниже
  durationMs: number;
  error?: JsonErrorPayload;
};
```

В отличие от операций нет `extensions[]` — вместо него один блок `data` со специфичной для подкоманды структурой.

| Команда                       | `data`                                                                                |
|-------------------------------|---------------------------------------------------------------------------------------|
| `diag top-used`               | `{ scanned, results: { name, dependents }[] }`                                        |
| `diag top-deps`               | `{ scanned, results: { name, directDeps }[] }`                                        |
| `diag top-deps-tree`          | `{ scanned, results: { name, treeSize }[] }`                                          |
| `diag top-bundle-size`        | `{ scanned, sortBy, results: { name, js, css, assets, total }[] }`                    |
| `diag top-total-size`         | `{ scanned, sortBy, results: { name, ownTotal, total, directDeps, treeDeps }[] }`     |
| `diag unused-deps`            | `{ scanned, results: { name, unused: string[] }[] }`                                  |
| `diag unused`                 | `{ scanned, results: { name }[] }`                                                    |
| `diag circular-deps`          | `{ scanned, results: { name, cycles: string[][] }[] }`                                |
| `diag circular-imports`       | `{ scanned, results: { name, cycles: string[][] }[] }`                                |
| `diag find-usages`            | `{ extension, usages: { type, file, line, content }[] }`                              |
| `diag deps-tree`              | tagged union по `mode`: `'tree' \| 'flat' \| 'why' \| 'not-found'`                    |
| `diag bundle-size`            | `{ extension, own, dependencies?, total? }` либо `{ extension, notFound: true }`      |
| `diag config`                 | tagged union по `mode`: `'match' \| 'except' \| 'missing'`                            |

Конкретные поля смотрите в TypeScript-определениях `src/reporters/json/diag.ts`.
