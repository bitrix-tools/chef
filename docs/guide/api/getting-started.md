# Установка и импорт

## Установка

API поставляется в том же пакете `@bitrix/chef`, что и CLI:

```bash
npm i @bitrix/chef
```

Минимальная версия Node.js — 22.

## Импорт

Все функции API собраны в namespace `chef`:

```ts
import { chef } from '@bitrix/chef';

await chef.build({ extension: 'main.core' });
await chef.lint({ extension: 'ui.*' });
await chef.diag.topUsed({ limit: 10 });

const pkg = await chef.getPackage('main.core');
```

Типы и константы — именованные:

```ts
import { chef, type ChefResult, type Package, CF } from '@bitrix/chef';

function logResult(result: ChefResult<unknown>) { /* ... */ }
```

## Параметр `cwd`

Все функции API принимают опциональный `cwd` — директорию, относительно которой ищется проект Bitrix. По умолчанию используется `process.cwd()`:

```ts
await chef.build({ extension: 'main.core' });                       // process.cwd()
await chef.build({ cwd: '/path/to/project', extension: 'main.core' });
```

Если `cwd` не находится внутри проекта Bitrix — функция вернёт результат с фатальной ошибкой `CF.PROJECT_ROOT_NOT_FOUND`. См. [Стандарт ответов](./response-format).

## Окружение — синглтон

Под капотом chef использует синглтон `Environment`, который хранит обнаруженный корень проекта. Каждый вызов API с новым `cwd` перезатирает контекст. Это значит:

- **Один проект за раз** — работает идеально.
- **Несколько проектов в одном процессе** — может приводить к гонкам, если вызовы пересекаются. Если действительно нужно работать с несколькими проектами параллельно, делайте это последовательно: завершите один вызов до старта другого.

## Что дальше

- Базовые команды: [Сборка](./build), [Линтинг](./lint), [Тесты](./test), [Type-check](./typecheck).
- Тонкая работа с расширением: [Package](./package).
- Принцип возврата результатов: [Стандарт ответов](./response-format).
