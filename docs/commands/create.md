# chef create

Создание нового расширения Bitrix со стандартной структурой файлов.

```bash
chef create <name> [options]
```

## Аргументы

| Аргумент | Описание |
|----------|----------|
| `name` | Имя расширения (например `my.extension`) |

## Параметры

| Параметр | Описание |
|----------|----------|
| `-p, --path [path]` | Создать расширение в указанной директории |
| `-t, --tech [tech]` | Технология: `ts` (по умолчанию) или `js` |
| `-f, --force` | Перезаписать существующую директорию без подтверждения |

## Примеры

```bash
chef create my.extension                          # Создать TypeScript-расширение
chef create my.extension --tech js                # Создать JavaScript-расширение
chef create my.extension -p ./local/js/vendor     # Создать в конкретной директории
chef create my.extension -f                       # Перезаписать без подтверждения
```

## Сгенерированные файлы

```
my.extension/
├── bundle.config.ts
├── config.php
└── src/
    └── my.extension.ts
```
