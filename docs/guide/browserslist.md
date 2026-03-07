# Browserslist

Chef uses [browserslist](https://github.com/browserslist/browserslist) to determine target browsers for [Babel](https://babeljs.io/) transpilation and [PostCSS](https://postcss.org/) autoprefixing.

By default, Chef targets `baseline widely available` — browsers with [widely available](https://web-platform-dx.github.io/web-features/) support for modern web features.

## How it works

1. If `targets` is specified in `bundle.config.ts`, Chef uses it directly
2. Otherwise, Chef looks for a `.browserslistrc` file up the directory tree from the extension
3. If no file is found, the default `baseline widely available` is used

## Custom targets

Specify targets directly in the config:

```ts
export default {
  // ...
  targets: ['last 2 versions', 'not dead'],
};
```

Or create a `.browserslistrc` file in the project root (use `chef init build` to generate one):

```
baseline widely available
```

## Migrating from `browserslist`

The `browserslist` option in `bundle.config` is deprecated. Use `targets` instead:

```ts
// Before
export default {
  browserslist: ['last 2 versions'],
};

// After
export default {
  targets: ['last 2 versions'],
};
```

The old `browserslist` option continues to work for backwards compatibility.
