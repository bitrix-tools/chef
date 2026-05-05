# Resolve

`chef.resolve(options)` — resolves patterns into a list of extensions without performing any action. Useful to check which extensions match before doing something with them.

Returns [`ChefDataResult<ResolveData>`](./response-format).

## Signature

```ts
chef.resolve(options?: ResolveOptions): Promise<ChefDataResult<ResolveData>>
```

## Options

| Field       | Type                 | Description                                       |
|-------------|----------------------|---------------------------------------------------|
| `extension` | `string \| string[]` | Names/patterns to resolve.                        |
| `path`      | `string`             | Directory to scan.                                |
| `cwd`       | `string`             | Working directory. Defaults to `process.cwd()`.   |

If neither `extension` nor `path` is given — every extension in the project is returned. `extension` and `path` are mutually exclusive.

## `ResolveData` shape

```ts
type ResolveData = {
  found: Array<{ name: string; path: string }>;
  notFound: Array<{ name: string; code: string; reason: string }>;
};
```

## Example: pre-check before action

```ts
import { chef } from '@bitrix/chef';

const r = await chef.resolve({ extension: 'ui.bbcode.*' });

if (!r.ok)
{
  for (const missing of r.data?.notFound ?? [])
  {
    console.warn(`Not found: ${missing.name}`);
  }
}

console.log(`Found ${r.data?.found.length} extensions`);
for (const ext of r.data?.found ?? [])
{
  console.log(`  ${ext.name} → ${ext.path}`);
}
```

## Example: list extensions of a module

```ts
const r = await chef.resolve({ extension: 'crm.timeline.**' });
const names = r.data?.found.map((ext) => ext.name) ?? [];
console.log(names);
```

## Alternative through `Package`

If you need full extension objects rather than just names/paths — use `chef.findPackages()`:

```ts
const packages = await chef.findPackages({ extension: 'ui.bbcode.*' });
for (const pkg of packages)
{
  console.log(pkg.getName(), pkg.getPath(), pkg.isTypeScript());
}
```

See the [Package page](./package#findpackages).
