# chef build

Сборка расширений с помощью Rollup, Babel и PostCSS.

```bash
chef build [extensions...] [options]
```

## Аргументы

| Аргумент | Описание |
|----------|----------|
| `extensions` | Имена расширений или glob-паттерны (например `main.core`, `ui.bbcode.*`) |

## Параметры

| Параметр | Описание |
|----------|----------|
| `-w, --watch` | Отслеживать изменения и пересобирать |
| `-p, --path [path]` | Собрать конкретную директорию |
| `-v, --verbose` | Подробный вывод сборки |
| `-f, --force` | Пропустить проверки и принудительно пересобрать |
| `--production` | Сборка в production-режиме (минификация, без source maps) |

## Примеры

```bash
chef build main.core ui.buttons    # Собрать конкретные расширения
chef build main.core -w            # Собрать и отслеживать изменения
chef build ui.bbcode.*             # Собрать расширения по паттерну
chef build ui.* -w                 # Собрать все ui.* с отслеживанием
chef build                         # Собрать все расширения в текущей директории
chef build ui.buttons --production # Production-сборка
```

## Production-режим

Флаг `--production` переключает сборку в production-режим:

| | Dev (по умолчанию) | Production |
|---|---|---|
| Source maps | включены | отключены |
| Минификация | отключена | включена (Terser) |
| Vue `__file` | добавляется | удаляется |

Если `sourceMaps` или `minification` явно заданы в `bundle.config` — значение из конфига имеет приоритет над режимом.

> **Примечание:** В zsh экранируйте glob-паттерны, чтобы предотвратить раскрытие оболочкой: `chef build ui.\*`
