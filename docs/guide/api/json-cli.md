# CLI `--json`

Каждая команда CLI поддерживает глобальный флаг `--json` — он подавляет обычный человекочитаемый вывод и печатает JSON в stdout. Формат полностью совпадает с [JS API](./response-format).

```bash
chef build main.core --json
chef lint 'ui.*' --json
chef test main.core --json --reporter=teamcity   # см. ниже
chef typecheck main.core --json
chef diag top-used --limit 10 --json
chef diag circular-deps --json
```

## Когда использовать

- Уже есть пайплайн на shell-скриптах — проще добавить `--json`, чем переписывать на Node.js.
- Нужно прокинуть результат во внешний инструмент (например, `jq`, дашборд, Slack-нотификатор).
- Хочется сравнить результаты между запусками — JSON удобно diff'ать.

## Под какими командами работает

| Команда                          | `--json`             |
|----------------------------------|----------------------|
| `chef build`                     | ✓                    |
| `chef lint`                      | ✓                    |
| `chef test`                      | ✓                    |
| `chef typecheck`                 | ✓                    |
| `chef diag top-used`             | ✓                    |
| `chef diag top-deps`             | ✓                    |
| `chef diag top-bundle-size`      | ✓                    |
| `chef diag unused-deps`          | ✓                    |
| `chef diag circular-deps`        | ✓                    |
| `chef diag circular-imports`     | ✓                    |
| Прочие подкоманды `diag`         | пока не поддерживается, добавим по запросам |
| `chef create`, `init`, `aliases` | не нужны в CI/CD     |

## Exit codes

- `0` — `ok: true`
- `1` — `ok: false`
- `2` — несовместимые флаги (см. ниже)

## Несовместимые флаги

`--watch` несовместим с `--json` — режим watch предполагает непрерывный вывод, что несовместимо с разовым JSON-документом.

```bash
$ chef build main.core --watch --json
{ "ok": false, "command": "build", "error": { "code": "CF2001", "message": "--watch is not supported with --json" } }
$ echo $?
2
```

## Что попадает в stdout

В режиме `--json` stdout — **только JSON**. Любые человекочитаемые сообщения (приветствия, прогресс-бары, таблицы) подавлены, чтобы вывод можно было сразу пропустить через парсер. Если случайно увидите там что-то ещё — это баг, заведите issue.

Stderr остаётся свободным для непредвиденных краше Node.js, но в нормальной работе и он молчит.

## Примеры

### Простой pipe в jq

```bash
chef diag top-bundle-size --limit 5 --json | jq '.data[] | {name, total}'
```

### Прервать пайплайн при ошибке

```bash
chef build 'ui.*' --json | jq -e '.ok' > /dev/null \
  || { echo 'Build failed'; exit 1; }
```

### Извлечь имена упавших расширений

```bash
chef lint 'ui.*' --json \
  | jq -r '.extensions[] | select(.ok == false) | .name'
```

### Получить размер конкретного бандла

```bash
chef build main.core --json | jq '.extensions[0].details.bundles[0].size'
```

### Список самых тяжёлых deps для одного расширения

Эта команда есть только в JS API (`pkg.getHeaviestDependencies`). Для shell-сценариев напишите тонкий скрипт:

```ts
// scripts/heaviest.ts
import { chef } from '@bitrix/chef';

const pkg = await chef.getPackage(process.argv[2]);
if (!pkg)
{
  console.error(`Расширение ${process.argv[2]} не найдено`);
  process.exit(1);
}

console.log(JSON.stringify(await pkg.getHeaviestDependencies({ limit: 10 }), null, 2));
```

```bash
npx tsx scripts/heaviest.ts main.core | jq '.[] | {name, total}'
```

## Альтернатива JSON: TeamCity-репортёр

Для тестов есть отдельный режим — `chef test --reporter=teamcity` — который выводит сервисные сообщения TeamCity вместо JSON. Используется в CI на TeamCity. Это **не** часть API-формата, см. [страницу команд](../commands).
