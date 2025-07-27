# @sovgut/datagrid-react-router

\<p align="center"\>
\<b\>A simple adapter to synchronize \<code\>@sovgut/datagrid\</code\> state with URL search parameters using React Router.\</b\>
\</p\>

\<p align="center"\>
\<img src="[https://img.shields.io/npm/v/@sovgut/datagrid-react-router](https://www.google.com/search?q=https://img.shields.io/npm/v/%40sovgut/datagrid-react-router)" alt="npm version" /\>
\<img src="[https://img.shields.io/npm/dm/@sovgut/datagrid-react-router](https://www.google.com/search?q=https://img.shields.io/npm/dm/%40sovgut/datagrid-react-router)" alt="npm downloads" /\>
\<img src="[https://img.shields.io/github/license/sovgut/datagrid-react-router](https://www.google.com/search?q=https://img.shields.io/github/license/sovgut/datagrid-react-router)" alt="license" /\>
\<img src="[https://img.shields.io/badge/TypeScript-Ready-blue](https://img.shields.io/badge/TypeScript-Ready-blue)" alt="TypeScript" /\>
\</p\>

## Description

This package provides a custom React hook, `useSharedDataGrid`, which serves as a bridge between the powerful `@sovgut/datagrid` library and `react-router-dom`. It allows you to store the state of your data grid (pagination, sorting, filters) directly in the URL, making it easily shareable, bookmarkable, and persistent across page reloads.

## Key Features

- 🔗 **URL State Sync** - Automatically updates URL parameters when the grid state changes.
- 🧩 **Seamless Integration** - Works as an external store for the `<DataGrid>` component.
- 📤 **Shareable States** - Users can share links with pre-applied sorting, filters, and the current page.
- 🛣️ **Built for React Router** - Uses the standard `useSearchParams` hook from `react-router-dom`.
- 🪶 **Lightweight** - Just a single hook that does all the work.

> [\!NOTE]
> This package is an **adapter**. It is designed to be used **together with** `@sovgut/datagrid` and `react-router-dom`. It does not provide any UI components.

---

## Installation

First, ensure you have all the necessary peer dependencies installed:

```bash
# npm
npm install react react-router-dom @sovgut/datagrid

# yarn
yarn add react react-router-dom @sovgut/datagrid

# pnpm
pnpm add react react-router-dom @sovgut/datagrid
```

Then, install the adapter itself:

```bash
# npm
npm install @sovgut/datagrid-react-router

# yarn
yarn add @sovgut/datagrid-react-router

# pnpm
pnpm add @sovgut/datagrid-react-router
```

---

## How It Works

The core idea is to use the `useSharedDataGrid` hook to create a `store`, which you then pass to the `store` prop of the `<DataGrid>` component.

1.  The `useSharedDataGrid` hook takes `[searchParams, setSearchParams]` from the `useSearchParams` hook (`react-router-dom`).
2.  It reads the initial state (pagination, sorting, filters) from the `URLSearchParams`.
3.  It returns an object compatible with `DataGridReducer`, which includes:
    - The current state, derived from the URL.
    - Functions (`setPagination`, `setSorting`, `setFilter`) that update the `URLSearchParams` when called.
4.  The `<DataGrid>` component uses this `store` as its single source of truth, and any state changes are automatically reflected in the URL.

---

## Usage Example

Here’s how to integrate `useSharedDataGrid` into your application. Note that the UI component (`MyTableUI`) remains the same as in the `@sovgut/datagrid` documentation. The only thing that changes is how the state is managed.

```tsx
import { DataGrid, type DataGridColumn, type DataGridRow } from "@sovgut/datagrid";
import { useSharedDataGrid } from "@sovgut/datagrid-react-router";
import { useSearchParams } from "react-router-dom";
import type { FC } from "react";

// 1. Define your data structure and columns (as usual)
interface User extends DataGridRow {
  id: number;
  name: string;
  email: string;
}

const columns: DataGridColumn<User>[] = [
  { key: "id", label: "ID" },
  { key: "name", label: "Name", sortable: true },
  { key: "email", label: "Email", sortable: true },
];

const rows: User[] = [
  { id: 1, name: "John Doe", email: "john@example.com" },
  { id: 2, name: "Jane Smith", email: "jane@example.com" },
  // ...
];

// Your UI component for the table (unchanged)
const MyTableUI: FC = () => {
  /* ... your table rendering logic ... */
  /* It will receive state from the DataGrid context */
};

// 2. Put it all together in a page component
export function UsersTablePage() {
  // Get the URL tools from React Router
  const searchParamsTuple = useSearchParams();

  // Create the store that syncs with the URL
  const store = useSharedDataGrid<User>(searchParamsTuple, columns);

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      size={rows.length}
      // Pass our store to manage the state
      store={store}
    >
      <MyTableUI />
    </DataGrid>
  );
}
```

Now, when a user changes the sort order or navigates to another page, the URL will update automatically, for example: `https://yourapp.com/users?page=2&sort=name&order=desc`.

---

## API Reference

### `useSharedDataGrid<TData>`

This is the only hook exported by the package.

#### Parameters

| Parameter           | Type                                    | Description                                                                                                                      |
| :------------------ | :-------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| `searchParamsTuple` | `[URLSearchParams, SetURLSearchParams]` | **Required.** The tuple returned by the `useSearchParams` hook from `react-router-dom`.                                          |
| `columns`           | `DataGridColumn<TData>[]`               | **Required.** The array of column definitions from `@sovgut/datagrid`. It is used to correctly parse filter values from the URL. |

#### Returns

The hook returns an object that conforms to the `DataGridReducer` interface from `@sovgut/datagrid`. This object is intended to be passed to the `store` prop of the `<DataGrid />` component.

The returned object contains:

- `page: number`
- `limit: number`
- `sort: string | null`
- `order: 'asc' | 'desc' | null`
- `filter: Record<string, any>`
- `selected: string[]` (managed via `useState` and is **not** synced with the URL)
- `setPagination: (page, limit) => void`
- `setSorting: (sort, order) => void`
- `setFilter: (filter) => void`
- `setSelected: (selected) => void`
- `setState: (state) => void`

---

## License

[MIT](./LICENSE)

## Contributing

Contributions are welcome\! Please feel free to submit a Pull Request to improve the package.
