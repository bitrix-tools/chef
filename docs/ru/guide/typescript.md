# Настройка TypeScript

Инициализируйте окружение сборки для проекта:

```bash
chef init build
```

Эта команда:

1. **Сканирует все расширения** в проекте
2. **Генерирует `aliases.tsconfig.json`** с алиасами путей для каждого расширения
3. **Создаёт `tsconfig.json`** с рекомендованными настройками
4. **Создаёт `.browserslistrc`** с рекомендованными целевыми браузерами

После инициализации можно импортировать расширения по имени:

```ts
import { Loc, Tag } from 'main.core';
import { Button } from 'ui.buttons';
```

## Сгенерированная конфигурация

**aliases.tsconfig.json** — автоматически сгенерированные маппинги путей:

```json
{
  "compilerOptions": {
    "baseUrl": "/path/to/project",
    "types": ["./bitrix/js/ui/dev/src/ui.dev.ts"],
    "paths": {
      "main.core": ["./bitrix/js/main/core/src"],
      "ui.buttons": ["./local/js/ui/buttons/src"]
    }
  }
}
```

**tsconfig.json** — основной конфиг, расширяющий алиасы:

```json
{
  "extends": "./aliases.tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "target": "ESNext",
    "moduleResolution": "bundler",
    "strict": true
  }
}
```

> Если `tsconfig.json` уже существует, команда спросит, нужно ли его перезаписать. Можно вручную добавить `"extends": "./aliases.tsconfig.json"` в существующий конфиг.
