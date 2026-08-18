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
 * A URL is typed by nobody, so a value that cannot be a page number - `?page=abc`,
 * `?limit=0` - is treated as no value at all rather than reaching the data
 * source as `NaN`.
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

/**
 * Writes a whole grid state into the search params, leaving nothing of the
 * previous one behind: `page` and `limit` always land, `sort` and `order`
 * disappear when the state is unsorted, and the filter and the selection are
 * replaced rather than merged.
 *
 * Applying it twice yields the same query string, which is what lets the URL
 * be compared against the state by serializing the state and comparing strings.
 */
export function writeState(params: URLSearchParams, state: DataGridState): void {
  params.set("page", String(state.page));
  params.set("limit", String(state.limit));

  if (state.sort === null || state.sort === undefined) {
    params.delete("sort");
  } else {
    params.set("sort", state.sort);
  }

  if (state.order === null || state.order === undefined) {
    params.delete("order");
  } else {
    params.set("order", state.order);
  }

  deleteFilterKeys(params);
  writeFilter(params, state.filter);
  writeSelected(params, state.selected);
}

/**
 * Compares two selection arrays by value, order significant: the order is the
 * consumer's to define, so a reordering counts as a change.
 */
export function isSelectedEqual(a: DataGridState["selected"], b: DataGridState["selected"]): boolean {
  if (a === b) {
    return true;
  }

  if (!a || !b || a.length !== b.length) {
    return false;
  }

  for (let index = 0; index < a.length; index++) {
    if (!Object.is(a[index], b[index])) {
      return false;
    }
  }

  return true;
}

/**
 * Compares two filter objects by value, one level deep, with array values
 * compared element by element.
 *
 * `{ a: undefined }` and `{}` are different: a `deriveState` that invalidates a
 * dependent filter usually does so by assigning `undefined`, and that change
 * has to be visible. A value that is neither a primitive nor an array of
 * primitives is compared by reference, which is as far as a value that has to
 * survive a round trip through a query string can go.
 */
export function isFilterEqual(a: DataGridState["filter"], b: DataGridState["filter"]): boolean {
  if (a === b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  const keys = Object.keys(a);

  if (keys.length !== Object.keys(b).length) {
    return false;
  }

  for (const key of keys) {
    if (!Object.hasOwn(b, key)) {
      return false;
    }

    const left = a[key];
    const right = b[key];

    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
        return false;
      }

      for (let index = 0; index < left.length; index++) {
        if (!Object.is(left[index], right[index])) {
          return false;
        }
      }

      continue;
    }

    if (!Object.is(left, right)) {
      return false;
    }
  }

  return true;
}

/**
 * Writes into the search params only what actually differs between two states.
 *
 * The repair that follows a column's `deriveState` is not the consumer asking
 * for a new state, so it touches as little of the URL as it can: a parameter
 * nobody moved keeps its value and its position, an absent `page` stays absent
 * rather than being filled in with the default, and a parameter that belongs to
 * the rest of the application survives the visit.
 */
export function applyStateDiff(params: URLSearchParams, from: DataGridState, to: DataGridState): void {
  if (from.page !== to.page) {
    params.set("page", String(to.page));
  }

  if (from.limit !== to.limit) {
    params.set("limit", String(to.limit));
  }

  if (from.sort !== to.sort) {
    if (to.sort === null || to.sort === undefined) {
      params.delete("sort");
    } else {
      params.set("sort", to.sort);
    }
  }

  if (from.order !== to.order) {
    if (to.order === null || to.order === undefined) {
      params.delete("order");
    } else {
      params.set("order", to.order);
    }
  }

  if (!isFilterEqual(from.filter, to.filter)) {
    for (const key of new Set([...Object.keys(from.filter ?? {}), ...Object.keys(to.filter ?? {})])) {
      params.delete(key);
    }

    writeFilter(params, to.filter);
  }

  if (!isSelectedEqual(from.selected, to.selected)) {
    writeSelected(params, to.selected);
  }
}

/**
 * Compares two query strings by content rather than by spelling: the same
 * parameters in a different order describe the same state, and rewriting the
 * URL to reorder them would be a navigation the reader never asked for.
 *
 * Values under one key keep their order, because a filter with several values
 * is an ordered list.
 */
export function isSameQuery(a: URLSearchParams, b: URLSearchParams): boolean {
  return canonicalQuery(a) === canonicalQuery(b);
}

function canonicalQuery(params: URLSearchParams): string {
  const entries = Array.from(params.entries()).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

  return new URLSearchParams(entries).toString();
}

/**
 * Compares two grid states by value, matching the comparison the grid itself
 * makes when it decides whether a column's `deriveState` moved the state.
 */
export function isStateEqual(a: DataGridState, b: DataGridState): boolean {
  return (
    a.page === b.page &&
    a.limit === b.limit &&
    a.sort === b.sort &&
    a.order === b.order &&
    isSelectedEqual(a.selected, b.selected) &&
    isFilterEqual(a.filter, b.filter)
  );
}
