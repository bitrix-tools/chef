# Инлайнинг типов в .d.ts

При сборке chef генерирует `.d.ts` для каждого расширения. В нём остаются типы, экспортируемые наружу — этот файл подключают расширения-потребители. TypeScript declaration emit умеет сохранять ссылки на соседние расширения вида `ui.icon-set.api.vue.BIcon`, но **только если у экспорта есть явная аннотация типа**.

Если аннотации нет, TypeScript **разворачивает** структуру типа целиком и кладёт её в ваш `.d.ts`. Ссылка на источник теряется. Это и называется инлайнингом.

Chef детектирует такие случаи и пишет предупреждение `CHEF_DTS` со строкой исходника, по которой видно, что и где нужно поправить.

## Почему это плохо

Один инлайненый компонент Vue добавляет в `.d.ts` ~30 строк. Несколько таких на расширение — и публичный `.d.ts` распухает в десятки раз.

Когда соседнее расширение меняется (`BIcon` получил новый prop), ваш инлайненый `.d.ts` остаётся со старой копией до пересборки. Потребители видят рассинхронизацию.

IDE у потребителей в подсказках показывает развёрнутую структуру вместо короткого `ui.icon-set.api.vue.BIcon` — навигация к источнику теряется.

## Виды инлайнинга и как чинить

### `vue-components` — `components: { BIcon }` без аннотации

Самый частый случай в Vue-расширениях. В `defineComponent({...})` объект `components` без аннотации разворачивает каждый компонент в полную структуру `DefineComponent<...>`.

**Без аннотации (инлайнится):**

```ts
import { defineComponent } from 'ui.vue3';
import { BIcon } from 'ui.icon-set.api.vue';

export const MyToolbar = defineComponent({
  components: { BIcon },
  // ...
});
```

В `.d.ts` уходит **развёрнутая структура** компонента:

```ts
export declare const MyToolbar: DefineComponent<..., {
  BIcon: {
    props: {
      name: { type: StringConstructor; required: boolean };
      color: { type: StringConstructor; required: false; default: null };
      size: { type: NumberConstructor; required: false; default: null };
      // ...все остальные props BIcon...
    };
    template: string;
  };
}, ...>;
```

**С аннотацией (сохраняется ссылка):**

```ts
export const MyToolbar = defineComponent({
  components: { BIcon } as { BIcon: typeof BIcon },
  // ...
});
```

В `.d.ts` остаётся короткая ссылка:

```ts
export declare const MyToolbar: DefineComponent<..., {
  BIcon: typeof BIcon;
}, ...>;
```

Аннотация `as { BIcon: typeof BIcon }` фиксирует тип объекта `components`, и TypeScript оставляет в `.d.ts` ссылку на исходный символ.

### `computed-arrow` — `(): typeof X => X` в `computed`

Стрелочные функции в `computed` иногда теряют ссылку на тип возврата при declaration emit.

**Без аннотации (инлайнится):**

```ts
computed: {
  icons: () => Outline,
},
```

В `.d.ts` уходит структура объекта:

```ts
icons: () => Readonly<{
  ACTIVITY: "o-activity";
  ACHIEVEMENT: "o-achievement";
  ALARM: "o-alarm";
  // ...все остальные ключи Outline...
}>;
```

**С аннотацией (сохраняется ссылка):**

```ts
computed: {
  icons(): typeof Outline
  {
    return Outline;
  },
},
```

В `.d.ts`:

```ts
icons(): typeof Outline;
```

Обычный метод с явным возвращаемым типом сохраняет ссылку надёжнее, чем стрелка.

### `export-const` — `export const X = ...` без аннотации

Топ-левел экспорт без явного типа — TypeScript выводит его и кладёт раскрытую структуру.

**Без аннотации (инлайнится):**

```ts
import { Outline } from 'ui.icon-set.api.vue';

export const MyIcons = Outline;
```

В `.d.ts`:

```ts
export declare const MyIcons: Readonly<{
  ACTIVITY: "o-activity";
  ACHIEVEMENT: "o-achievement";
  ALARM: "o-alarm";
  // ...
}>;
```

**С аннотацией (сохраняется ссылка):**

```ts
export const MyIcons: typeof Outline = Outline;
```

В `.d.ts`:

```ts
export declare const MyIcons: typeof Outline;
```

### Общий случай

Если ни один рецепт не подходит — добавьте `: typeof X` в указанной строке. Это всегда даст ссылку вместо инлайна.

## Когда инлайнинга нет

Не каждое использование импортированного типа приводит к инлайну. TypeScript оставляет ссылку **без всяких аннотаций**, когда:

- значение **передаётся как есть**, а у функции уже есть аннотация возвращаемого типа:

  ```ts
  import { Outline } from 'ui.icon-set.api.vue';

  export function getIcons(): typeof Outline {
    return Outline;
  }
  ```

- импортированный тип используется в **позиции типа** (а не как значение):

  ```ts
  import type { Set } from 'ui.icon-set.api.core';

  export function pickIcon(set: Set): void { /* ... */ }
  ```

- это **named class** — у него есть собственное имя, и TypeScript ссылается на него по имени:

  ```ts
  import { IconClass } from 'ui.icon-set.api.core';

  export function make() {
    return new IconClass();
  }
  // → export declare function make(): IconClass;
  ```

Если в `.d.ts` уже видна короткая ссылка вида `typeof Foo` или `Foo`, аннотация не нужна.

## Когда warning ложный

Chef иногда находит инлайнинг там, где его нет — например, на структурно эквивалентных пустых объектах. Если рецепт явно не помогает и сообщение похоже на ложное срабатывание — заведите issue с минимальным воспроизведением: [github.com/bitrix-tools/chef/issues](https://github.com/bitrix-tools/chef/issues).

## Связанные страницы

- [TypeScript](/guide/typescript) — общая настройка TS в chef
- [Коды ошибок](/guide/errors#CHEF_DTS) — каталог всех диагностик
