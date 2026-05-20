# CLI `--reporter`

Команды `chef` поддерживают опцию `--reporter <name>` — переключатель формата вывода. Сейчас доступны:

- `default` — человекочитаемый вывод (используется по умолчанию).
- `json` — структурированный JSON в stdout. Формат — на странице [Формат ответа](./response-format).
- `teamcity` — сервисные сообщения TeamCity, только для `chef test`.

```bash
chef build main.core --reporter json
chef lint 'ui.*' --reporter json
chef test main.core --reporter json
chef typecheck main.core --reporter json
chef diag top-used --limit 10 --reporter json
chef diag circular-deps --reporter json
```

## Когда использовать `json`

- Уже есть пайплайн на shell-скриптах — проще добавить `--reporter json`, чем писать парсеры человеческого вывода.
- Нужно прокинуть результат во внешний инструмент (например, `jq`, дашборд, Slack-нотификатор).
- Хочется сравнить результаты между запусками — JSON удобно diff'ать.

## В каких командах работает

| Команда                          | `--reporter json` |
|----------------------------------|-------------------|
| `chef build`                     | ✓                 |
| `chef lint`                      | ✓                 |
| `chef test`                      | ✓                 |
| `chef typecheck`                 | ✓                 |
| `chef diag top-used`             | ✓                 |
| `chef diag top-deps`             | ✓                 |
| `chef diag top-deps-tree`        | ✓                 |
| `chef diag top-bundle-size`      | ✓                 |
| `chef diag top-total-size`       | ✓                 |
| `chef diag config`               | ✓                 |
| `chef diag unused-deps`          | ✓                 |
| `chef diag unused`               | ✓                 |
| `chef diag circular-deps`        | ✓                 |
| `chef diag circular-imports`     | ✓                 |
| `chef diag find-usages`          | ✓                 |
| `chef diag find-loaders`         | ✓                 |
| `chef diag deps-tree`            | ✓                 |
| `chef diag bundle-size`          | ✓                 |
| `chef diag baseline`             | пока нет          |
| `chef create`, `init`, `aliases` | не нужны в CI     |

## Exit codes

- `0` — `success: true`
- `1` — `success: false` (есть ошибки сборки/линта/тестов)
- `2` — несовместимые флаги (например, `--watch` с `--reporter json`)

## Несовместимые флаги

`--watch` несовместим с `--reporter json` — режим watch предполагает непрерывный вывод, что несовместимо с разовым JSON-документом.

```bash
$ chef build main.core --watch --reporter json
{ "success": false, "command": "build", "error": { "code": "CF2001", "message": "--watch is not supported with --reporter json" }, ... }
$ echo $?
2
```

## Что попадает в stdout

В режиме `--reporter json` stdout — **только JSON**. Любые человекочитаемые сообщения (приветствия, прогресс-бары, таблицы) подавлены, чтобы вывод можно было сразу пропустить через парсер. Если случайно увидите там что-то ещё — это баг, заведите issue.

Stderr остаётся свободным для непредвиденных краш-репортов Node.js, но в нормальной работе и он молчит.

## Примеры

### Простой pipe в jq

```bash
chef diag top-bundle-size --limit 5 --reporter json | jq '.data.results[] | {name, total}'
```

### Прервать пайплайн при ошибке

```bash
chef build 'ui.*' --reporter json | jq -e '.success' > /dev/null \
  || { echo 'Build failed'; exit 1; }
```

### Извлечь имена упавших расширений

```bash
chef lint 'ui.*' --reporter json \
  | jq -r '.extensions[] | select(.success == false) | .name'
```

### Получить размер конкретного бандла

```bash
chef build main.core --reporter json | jq '.extensions[0].details.bundles[0].size'
```

### Найти упавшие тесты с указанием места падения

```bash
chef test 'ui.*' --reporter json \
  | jq -r '.extensions[].errors[] | "\(.file):\(.line)  \(.message)"'
```

## Reporter `teamcity`

Только для `chef test`. Вместо JSON печатает сервисные сообщения TeamCity (`##teamcity[testStarted ...]`). Используется в CI на TeamCity.

```bash
chef test main.core --reporter teamcity
```
