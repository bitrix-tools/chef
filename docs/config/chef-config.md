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
    resolveNodeModules: {
      severity: 'warning',
      message: 'Инлайн npm-зависимостей не рекомендуется',
    },
  },
};
```

| Поле | Тип | Описание |
|------|-----|----------|
| `severity` | `'error' \| 'warning'` | `error` — сборка останавливается, `warning` — продолжается с предупреждением |
| `message` | `string` | Кастомный текст ошибки или предупреждения |

## defaults — значения по умолчанию

Устанавливает дефолтные значения для всех расширений. Расширение может переопределить их в своём `bundle.config`.

```ts
export default {
  defaults: {
    targets: 'last 2 versions',
    sourceMaps: true,
    treeshake: true,
  },
};
```

## enforce — принудительные значения

Принудительно задаёт значения для всех расширений. Расширение **не может** переопределить их в `bundle.config`.

```ts
export default {
  enforce: {
    targets: 'baseline widely available',
    sourceMaps: false,
    babel: true,
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
