# Browserslist

Chef uses [browserslist](https://github.com/browserslist/browserslist) to determine target browsers for [Babel](https://babeljs.io/) transpilation and [PostCSS](https://postcss.org/) autoprefixing.

## Setup

Create a `.browserslistrc` file in the project root with the recommended config:

```
baseline widely available
```

This targets browsers that have [widely available](https://web-platform-dx.github.io/web-features/) support for modern web features — a good default for most projects.

Then enable it in your `bundle.config.ts`:

```ts
export default {
  input: './src/my.extension.ts',
  output: './dist/my.extension.bundle.js',
  browserslist: true,
};
```

## How it works

When `browserslist` is set to `true`, Chef looks for `.browserslistrc` up the directory tree from the extension. If the file is not found, the setting has no effect.

You can also specify targets directly in the config instead of using a separate file:

```ts
export default {
  // ...
  browserslist: ['last 2 versions', 'not dead'],
};
```

If `browserslist` is omitted or set to `false`, the default targets are used (`IE >= 11`, `last 4 version`).

> When you scaffold an extension with `chef create`, the generated config automatically sets `browserslist: true` if a `.browserslistrc` file exists in the project.