# chef.config

Файл `chef.config.ts` (или `chef.config.js`) в корне проекта позволяет задать правила и ограничения для всех расширений.

```ts
export default {
  deny: { /* запрет опций */ },
  defaults: { /* значения по умолчанию */ },
  enforce: { /* принудительные значения */ },
};
```

## deny — запрет опций

Запрещает использование определённых возможностей. Если расширение нарушает правило, сборка завершится ошибкой или предупреждением.

```ts
export default {
  deny: {
    sfc: true,                    // запретить Vue SFC
    standalone: true,             // запретить standalone-сборки
    minification: true,           // запретить минификацию
    resolveNodeModules: true,     // запретить инлайн npm-зависимостей
    transformClasses: true,       // запретить трансформацию классов
    sourceMaps: true,             // запретить source maps
    exportDefault: true,          // запретить export default в точке входа
    targets: true,                // запретить собственные целевые браузеры
  },
};
```

Каждое правило может быть `true` (ошибка с текстом по умолчанию) или объектом с настройками:

```ts
export default {
  deny: {
    sfc: {
      severity: 'error',
      message: 'SFC запрещены, используйте render functions',
    },
    exportDefault: {
      severity: 'error',
      message: 'Используйте именованные экспорты вместо export default',
    },
  },
};
```

| Поле | Тип | Описание |
|------|-----|----------|
| `severity` | `'error' \| 'warning'` | `error` — сборка останавливается, `warning` — продолжается с предупреждением |
| `message` | `string` | Кастомный текст ошибки или предупреждения |

### deny.targets — собственные целевые браузеры {#deny-targets}

Запрещает расширениям задавать свои целевые браузеры: все расширения собираются с таргетами проекта. Своими считаются:

- `targets` (или устаревший `browserslist`) со строкой или массивом в `bundle.config`. Значение `browserslist: true` не нарушает правило;
- файл `.browserslistrc`, `browserslist` или поле `browserslist` в `package.json` в папке расширения или в любой папке между ним и корнем проекта;
- переменные окружения `BROWSERSLIST` и `BROWSERSLIST_CONFIG`.

Свои таргеты не применяются ни при каком `severity`: с `error` сборка останавливается, с `warning` расширение собирается с таргетами проекта и выводится предупреждение со списком найденных источников. Таргеты проекта берутся в таком порядке:

1. `enforce.targets`
2. конфиг browserslist в корне проекта (например, `.browserslistrc`)
3. `defaults.targets`
4. `baseline widely available`

Те же таргеты используют unit-тесты, `chef baseline` и `chef diag baseline`.

```ts
export default {
  deny: {
    targets: {
      severity: 'error',
      message: 'Целевые браузеры задаются только в .browserslistrc в корне проекта',
    },
  },
};
```

## defaults — значения по умолчанию

Устанавливает дефолтные значения для всех расширений. Расширение может переопределить их в своём `bundle.config`.

`defaults.targets` применяется, если у расширения нет своих таргетов и ни один конфиг browserslist не найден — ни у расширения, ни в корне проекта.

```ts
export default {
  defaults: {
    targets: 'last 2 versions',
    sourceMaps: true,
    treeshake: true,
    emitDeclaration: true,
  },
};
```

## enforce — принудительные значения

Принудительно задаёт значения для всех расширений. Расширение **не может** переопределить их в `bundle.config`.

`enforce.targets` молча перекрывает любые другие таргеты. Чтобы сообщать о попытках задать свои таргеты, добавьте [`deny.targets`](#deny-targets).

```ts
export default {
  enforce: {
    targets: 'baseline widely available',
    sourceMaps: false,
    babel: true,
    emitDeclaration: true,
  },
};
```

## Пример

```ts
// chef.config.ts
export default {
  deny: {
    sfc: true,
    standalone: {
      severity: 'warning',
      message: 'Standalone не рекомендуется',
    },
  },
  defaults: {
    targets: 'last 2 versions',
  },
  enforce: {
    sourceMaps: false,
  },
};
```
