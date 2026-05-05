# Обзор API

Chef можно использовать программно из Node.js или получить машиночитаемый вывод от CLI. Это нужно для CI/CD, скриптов автоматизации и кастомных интеграций.

## Две формы

**JS API** — функции и классы, которые импортируются из пакета:

```ts
import { chef } from '@bitrix/chef';

const result = await chef.build({ extension: 'main.core' });
```

**CLI `--json`** — глобальный флаг к существующим командам:

```bash
chef build main.core --json
```

Под капотом обе формы вызывают один и тот же код. Результаты идентичны — выбор зависит от того, что удобнее в вашем сценарии.

## Когда что использовать

- **Своя логика на Node.js** — JS API. Можно гибко комбинировать вызовы, обрабатывать результаты в коде, получать «голые» данные через фасад `Package`.
- **Существующий пайплайн на shell** — CLI `--json`. Получите структурированный вывод, прокиньте в `jq` или сторонний CI-сервис.
- **Тонкая инспекция расширения** — фасад `Package`. Получите объект расширения по имени и работайте с ним напрямую.

## Hello world

```ts
import { chef } from '@bitrix/chef';

const result = await chef.build({
  cwd: '/path/to/project',
  extension: 'main.core',
});

if (!result.ok)
{
  console.error(`Сборка не прошла: ${result.summary.failed} расширений с ошибками`);
  process.exit(1);
}
```

## Дальше по разделам

- [Установка и импорт](./getting-started)
- [Сборка](./build), [Линтинг](./lint), [Тесты](./test), [Type-check](./typecheck)
- [Resolve](./resolve), [Diag](./diag)
- [Расширение (Package)](./package) — главный фасад для тонкой работы
- [Стандарт ответов](./response-format)
- [Коды ошибок](./errors)
- [CLI `--json`](./json-cli)
