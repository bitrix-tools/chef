# chef.config

A `chef.config.ts` (or `chef.config.js`) file in the project root lets you set rules and constraints for all extensions.

```ts
export default {
  deny: { /* block specific options */ },
  defaults: { /* default values */ },
  enforce: { /* forced values */ },
};
```

## deny — block options

Prevents the use of certain features. If an extension violates a rule, the build will fail with an error or show a warning.

```ts
export default {
  deny: {
    sfc: true,                    // block Vue SFC
    standalone: true,             // block standalone builds
    minification: true,           // block minification
    resolveNodeModules: true,     // block inlining npm dependencies
    transformClasses: true,       // block class transformation
    sourceMaps: true,             // block source maps
  },
};
```

Each rule can be `true` (error with default message) or an object with settings:

```ts
export default {
  deny: {
    sfc: {
      severity: 'error',
      message: 'SFC are not allowed, use render functions',
    },
    resolveNodeModules: {
      severity: 'warning',
      message: 'Inlining npm dependencies is not recommended',
    },
  },
};
```

| Field | Type | Description |
|-------|------|-------------|
| `severity` | `'error' \| 'warning'` | `error` — build stops, `warning` — build continues with a warning |
| `message` | `string` | Custom error or warning text |

## defaults — default values

Sets default values for all extensions. An extension can override them in its `bundle.config`.

```ts
export default {
  defaults: {
    targets: 'last 2 versions',
    sourceMaps: true,
    treeshake: true,
  },
};
```

## enforce — forced values

Forces values for all extensions. An extension **cannot** override them in `bundle.config`.

```ts
export default {
  enforce: {
    targets: 'baseline widely available',
    sourceMaps: false,
    babel: true,
  },
};
```

## Example

```ts
// chef.config.ts
export default {
  deny: {
    sfc: true,
    standalone: {
      severity: 'warning',
      message: 'Standalone is not recommended',
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
