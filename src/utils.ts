import type { DataGridColumn, DataGridState } from "@sovgut/datagrid";

import type { ExpectedAny } from "./types.ts";

/**
 * The query parameters this hook owns.
 *
 * Everything else in the search string is treated as a column filter, so a
 * column may not take one of these as its key without colliding with the
 * grid's own state.
 */
export const DATAGRID_RESERVED_KEYS: readonly string[] = ["page", "limit", "sort", "order", "selected"];

/**
 * Produces a copy of a grid state that a `deriveState` function may mutate
 * freely without touching the state this hook derived from the URL.
 *
 * Layered rather than deep, matching `cloneDataGridState` in the core: the
 * state object, its `filter` and its `selected` are fresh, and values nested
 * inside a filter entry are shared by reference. That is the depth a
 * `deriveState` reaches when it assigns or deletes a filter entry.
 *
 * The previous implementation was a `JSON.parse(JSON.stringify(...))` round
 * trip, which drops `undefined`, turns a `Date` into a string and throws on a
 * cycle. Everything this hook clones comes out of the URL and is therefore a
 * string or an array of strings, so the two agree on real input; this one just
 * has no failure mode for the input a `deriveState` might introduce.
 */
export function cloneDataGridState(state: DataGridState): DataGridState {
  return {
    ...state,
    filter: state.filter ? { ...state.filter } : {},
    selected: state.selected ? [...state.selected] : [],
  };
}

/**
 * Applies every column's `deriveState`, in column order, each one receiving
 * what the previous returned.
 *
 * The hook runs this itself rather than leaving it to the grid, so the state it
 * returns already carries the implicit filters a column enforces. Without it
 * the first request would go out without them and be thrown away.
 */
export function calculateDerivedState<TData>(
  initialState: DataGridState,
  columns: DataGridColumn<TData>[]
): DataGridState {
  let currentState = cloneDataGridState(initialState);

  for (const column of columns) {
    if (typeof column.filterConfig?.deriveState === "function") {
      currentState = column.filterConfig.deriveState(currentState);
    }
  }

  return currentState;
}

/**
 * Removes every filter parameter, leaving the grid's own keys untouched.
 *
 * Filters are written wholesale rather than merged, so the previous set has to
 * go first: a key the new filter does not mention must disappear from the URL.
 */
export function deleteFilterKeys(params: URLSearchParams): void {
  for (const key of Array.from(params.keys())) {
    if (!DATAGRID_RESERVED_KEYS.includes(key)) {
      params.delete(key);
    }
  }
}

/**
 * Writes a filter into the search params.
 *
 * A `null` or `undefined` value means "no filter" and is skipped rather than
 * serialized, at both levels: the entry itself and each element of an array
 * value. Writing it would put the string `"undefined"` in the URL and send it
 * to the server as a real filter value.
 *
 * An array becomes a repeated parameter, which is what a column marked
 * `multiple` reads back through `getAll`.
 */
export function writeFilter(params: URLSearchParams, filter: DataGridState["filter"]): void {
  for (const key of Object.keys(filter ?? {})) {
    const value = filter[key];

    if (value === null || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== null && item !== undefined) {
          params.append(key, String(item));
        }
      }

      continue;
    }

    params.set(key, String(value));
  }
}

/**
 * Replaces the selected ids, dropping the parameter entirely when nothing is
 * selected so an empty selection does not leave `?selected=` behind.
 */
export function writeSelected(params: URLSearchParams, selected: DataGridState["selected"]): void {
  params.delete("selected");

  for (const value of selected ?? []) {
    if (value !== null && value !== undefined) {
      params.append("selected", String(value));
    }
  }
}

/**
 * Reads a positive integer out of the search params, falling back when the
 * parameter is absent or is not one.
 *
 * `?page=abc` used to reach the data source as `NaN`. A URL is typed by nobody,
 * so a value that cannot be a page number is treated as no value at all.
 */
export function readPositiveInt(params: URLSearchParams, key: string, fallback: number): number {
  if (!params.has(key)) {
    return fallback;
  }

  const parsed = Number(params.get(key));

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Fails when a column key would collide with a parameter the grid owns.
 *
 * The collision is silent and destructive otherwise: writing the filter would
 * `set` the reserved parameter, so a column keyed `page` overwrites the
 * pagination, while `deleteFilterKeys` refuses to clear it because the name is
 * reserved. Naming a column this way is always a mistake, so it fails at mount
 * with the key in the message rather than corrupting the URL later.
 */
export function assertNoReservedKeys<TData>(columns: DataGridColumn<TData>[]): void {
  for (const column of columns) {
    if (DATAGRID_RESERVED_KEYS.includes(column.key)) {
      throw new RangeError(
        `useSharedDataGrid: the column key "${column.key}" is reserved, because it is also the name of a query parameter the grid owns. Reserved keys: ${DATAGRID_RESERVED_KEYS.join(", ")}.`
      );
    }
  }
}

/**
 * Reads a filter value for one column: an array when the column accepts
 * multiple values, a single string otherwise, and nothing at all when the
 * parameter is absent.
 */
export function readColumnFilter<TData>(
  params: URLSearchParams,
  columns: DataGridColumn<TData>[]
): Record<string, ExpectedAny> {
  const filter: Record<string, ExpectedAny> = {};

  for (const column of columns) {
    if (params.has(column.key)) {
      filter[column.key] = column.multiple ? params.getAll(column.key) : params.get(column.key);
    }
  }

  return filter;
}
