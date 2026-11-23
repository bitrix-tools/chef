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
    exportDefault: true,          // block export default in entry point
    targets: true,                // block own browser targets
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
    exportDefault: {
      severity: 'error',
      message: 'Use named exports instead of export default',
    },
  },
};
```

| Field | Type | Description |
|-------|------|-------------|
| `severity` | `'error' \| 'warning'` | `error` — build stops, `warning` — build continues with a warning |
| `message` | `string` | Custom error or warning text |

### deny.targets — own browser targets {#deny-targets}

Prevents extensions from setting their own browser targets: every extension is built with the project targets. Own targets are:

- `targets` (or the deprecated `browserslist`) set to a string or an array in `bundle.config`. `browserslist: true` does not violate the rule;
- a `.browserslistrc` or `browserslist` file, or a `browserslist` field in `package.json`, in the extension directory or in any directory between it and the project root;
- the `BROWSERSLIST` and `BROWSERSLIST_CONFIG` environment variables.

Own targets are never applied, whatever the `severity`: with `error` the build stops, with `warning` the extension is built with the project targets and a warning lists the sources found. Project targets are taken in this order:

1. `enforce.targets`
2. the browserslist config in the project root (for example, `.browserslistrc`)
3. `defaults.targets`
4. `baseline widely available`

Unit tests, `chef baseline` and `chef diag baseline` use the same targets.

```ts
export default {
  deny: {
    targets: {
      severity: 'error',
      message: 'Browser targets are set only in .browserslistrc in the project root',
    },
  },
};
```

## defaults — default values

Sets default values for all extensions. An extension can override them in its `bundle.config`.

`defaults.targets` applies when the extension has no own targets and no browserslist config is found — neither for the extension nor in the project root.

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

## enforce — forced values

Forces values for all extensions. An extension **cannot** override them in `bundle.config`.

`enforce.targets` silently overrides any other targets. To report attempts to set own targets, add [`deny.targets`](#deny-targets).

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
