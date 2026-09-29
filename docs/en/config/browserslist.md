# Browserslist

Chef uses [browserslist](https://github.com/browserslist/browserslist) to determine target browsers for [Babel](https://babeljs.io/) transpilation and [PostCSS](https://postcss.org/) autoprefixing.

By default, Chef targets `baseline widely available` — browsers with [widely available](https://web-platform-dx.github.io/web-features/) support for modern web features.

## How it works

1. If `targets` is specified in `bundle.config.ts`, Chef uses it directly
2. Otherwise, Chef looks for a `.browserslistrc` file up the directory tree from the extension
3. If no file is found, the default `baseline widely available` is used

## Browser data

Chef takes browser versions and their support from the [caniuse-lite](https://github.com/browserslist/caniuse-lite) database, which ships with Chef and is refreshed with every Chef release. To get fresh data, update Chef:

```bash
npm i -g @bitrix/chef
```

If the database is older than half a year, Chef reminds you after running a command. The browserslist advice `npx update-browserslist-db` does not help here: it updates the database in the current project, not the one shipped with Chef.

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
