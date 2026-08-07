<p align="center">
<img src="https://raw.githubusercontent.com/Sovgut/datagrid-react-router/main/assets/logo.svg" alt="" width="72" height="72" />
</p>

<h1 align="center">@sovgut/datagrid-react-router</h1>

<p align="center">
Puts <a href="https://github.com/Sovgut/datagrid">@sovgut/datagrid</a> table state in the URL. Pagination, sorting, per-column filters and selection round-trip through React Router's search params, so every view of a table is a link you can share, bookmark and reload.
</p>

<p align="center">
<img src="https://img.shields.io/npm/v/@sovgut/datagrid-react-router" alt="npm version" />
<img src="https://img.shields.io/npm/dm/@sovgut/datagrid-react-router" alt="npm downloads" />
<img src="https://img.shields.io/github/license/sovgut/datagrid-react-router" alt="license" />
<img src="https://img.shields.io/badge/TypeScript-Ready-blue" alt="TypeScript" />
</p>

## Contents

- [What this is](#what-this-is)
- [Installation](#installation)
- [Quick start](#quick-start)
- [What lands in the URL](#what-lands-in-the-url)
- [Reading it back](#reading-it-back)
- [`deriveState` runs here, on purpose](#derivestate-runs-here-on-purpose)
- [The setters](#the-setters)
- [Performance notes](#performance-notes)
- [API reference](#api-reference)

## What this is

One hook. It implements `DataGridReducer` from `@sovgut/datagrid` on top of
React Router's `useSearchParams`, so the grid reads and writes the query string
instead of its own store.

**It is** the whole state layer for a table whose state should be in the address
bar: back and forward work, a reload keeps the view, and a link carries the
filters with it.

**It is not** a grid, and it does not render anything. The core owns the table
logic and your own components own the markup; this package only decides where
the state lives.

## Installation

```bash
npm install @sovgut/datagrid-react-router
```

Three peer dependencies, all of which you already have if you are using the
grid with React Router:

| Peer | Range |
| :--- | :--- |
| `@sovgut/datagrid` | `^5.0.0` |
| `react` | `^19.0.0` |
| `react-router` | `>=7.0.0` |

The core is a peer rather than a bundled dependency on purpose: the grid keeps
module-level defaults that it documents as single values shared by every table
on the page, and a second copy of the core would quietly break that.

## Quick start

```tsx
import { DataGrid, type DataGridColumn, type DataGridRow } from "@sovgut/datagrid";
import { useSharedDataGrid } from "@sovgut/datagrid-react-router";
import { useSearchParams } from "react-router";
import { useMemo } from "react";

interface Order extends DataGridRow {
  id: number;
  status: string;
}

export function Orders() {
  const columns = useMemo<DataGridColumn<Order>[]>(
    () => [
      { key: "id", label: "ID" },
      { key: "status", label: "Status", sortable: true },
      { key: "bank", label: "Bank", multiple: true },
    ],
    []
  );

  // The whole integration: hand the hook the tuple and the columns, hand the
  // result to `store`.
  const store = useSharedDataGrid<Order>(useSearchParams(), columns);
  const { data } = useOrders(store);

  return (
    <DataGrid store={store} columns={columns} rows={data.items} size={data.total}>
      <OrdersTable />
    </DataGrid>
  );
}
```

`store` is also the query: read `store.page`, `store.sort` and `store.filter`
directly when you build the request. There is no second source of truth to keep
in sync.

## What lands in the URL

| Parameter | Written by | Shape |
| :--- | :--- | :--- |
| `page` | `setPagination`, `setState` | a positive integer |
| `limit` | `setPagination`, `setState` | a positive integer |
| `sort` | `setSorting`, `setState` | a column key; removed when unsorted |
| `order` | `setSorting`, `setState` | `asc` or `desc`; removed when unsorted |
| `selected` | `setSelected`, `setState` | repeated once per selected id |
| one per column key | `setFilter`, `setState` | the filter value, repeated for an array |

**A column key is a query parameter name.** That makes the five names above
reserved, and the hook throws on mount if a column claims one. It would
otherwise fail silently and destructively: writing the filter would overwrite
the grid's own parameter, and clearing the filter would refuse to remove it.

It also makes a column key part of your public URLs, so renaming one breaks
links that are already out there.

## Reading it back

A URL is typed by nobody, so everything is validated on the way in:

- **Filter values come back as strings.** A column marked `multiple` gets a
  `string[]` from every repetition of its parameter; every other column gets a
  single `string`. If your API wants numbers, convert at the call site.
- **`page` and `limit` fall back** to the package defaults unless the parameter
  is a positive integer. `?page=abc` is treated as no page at all rather than
  being passed on as `NaN`.
- **`order` must be exactly `asc` or `desc`.** Anything else is read as
  unsorted, because those are the only two values this hook ever writes and the
  grid's type promises nothing wider.
- **Unknown parameters are left alone.** Only keys that match a column are
  collected into `filter`, so the table can share a URL with the rest of your
  app.

## `deriveState` runs here, on purpose

The hook applies every column's `filterConfig.deriveState` to the state it read
from the URL, before returning it.

That is deliberate and it matters: a column that enforces an implicit filter
(only your own records, only this organization) has to have applied it by the
time you build the first request. Left to the grid, the first fetch would go
out without it and its result would be thrown away one render later.

The state handed to `deriveState` is a copy: the state object, its `filter` and
its `selected` are fresh, and values nested inside a filter entry are shared by
reference. Assign and delete filter entries freely; replace nested values rather
than editing them in place.

## The setters

All five write to the URL and nothing else. There is no local state behind them.

- **`setFilter` replaces the filter wholesale.** Every parameter that is not one
  of the five reserved names is cleared first, so a key the new filter does not
  mention disappears. To clear one filter, pass the rest.
- **A `null` or `undefined` filter value is skipped**, at the entry level and
  inside an array, rather than being written as the string `"undefined"`.
- **`setSorting` accepts `undefined`** for either argument and treats it like
  `null`, removing the parameter.
- **None of them replace the history entry.** Every change is a new entry, so
  the browser's back button steps through the user's filtering. If you need
  something else, that is a change to this package rather than an option.
- **Calling `store.setFilter` directly does not reset the page.** The grid's
  own `resetPageOnQueryChange` applies to the grid's setters; reach into the
  store and you are talking to the URL, not to the grid.

## Performance notes

**Memoize `columns`.** The hook derives its state from them, so a fresh array on
every render recomputes that state on every render and hands the grid a new
store object each time. `useMemo` on the column array is the whole fix.

The returned object is memoized here, which the core's documentation requires
of an external store: an unstable one is the one known way to turn the grid's
synchronization pass into an update loop.

## API reference

### `useSharedDataGrid(searchParams, columns)`

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `searchParams` | `[URLSearchParams, SetURLSearchParams]` | The tuple returned by `useSearchParams()`. Pass it straight through. |
| `columns` | `DataGridColumn<TData>[]` | The same definitions the grid gets. Their keys name the query parameters and their `deriveState` runs here. |

Returns a `DataGridReducer`: the state fields below plus `setPagination`,
`setSorting`, `setFilter`, `setSelected` and `setState`.

| Field | Type | Source |
| :--- | :--- | :--- |
| `page` | `number` | `?page`, else `1` |
| `limit` | `number` | `?limit`, else `10` |
| `sort` | `string \| null` | `?sort` |
| `order` | `"asc" \| "desc" \| null` | `?order` |
| `filter` | `Record<string, any>` | one parameter per column key |
| `selected` | `string[]` | every `?selected` |

Every field is synced with the URL, selection included.

## Contributing

Issues and pull requests are welcome. Before opening one:

```bash
npm ci
npm run check      # Biome, rewrites files
npm run typecheck
npm test           # runs coverage, which is gated at 100%
npm run build
```

## License

[MIT](./LICENSE)
