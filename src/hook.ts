import {
  DATAGRID_DEFAULT_LIMIT,
  DATAGRID_DEFAULT_ORDER,
  DATAGRID_DEFAULT_PAGE,
  DATAGRID_DEFAULT_SORT,
  DATAGRID_SORT_ASC,
  DATAGRID_SORT_DESC,
  type DataGridColumn,
  type DataGridReducer,
  type DataGridRow,
  type DataGridState,
} from "@sovgut/datagrid";
import { useCallback, useMemo } from "react";
import type { SetURLSearchParams } from "react-router";

import {
  assertNoReservedKeys,
  calculateDerivedState,
  deleteFilterKeys,
  readColumnFilter,
  readPositiveInt,
  writeFilter,
  writeSelected,
} from "./utils.ts";

/**
 * Backs a `<DataGrid>` with the URL instead of its own store.
 *
 * Hand the result to the grid's `store` prop and the table's state becomes the
 * query string: every page, sort, filter and selection is in the address bar,
 * so a view can be linked, bookmarked and reloaded.
 *
 * ```tsx
 * const store = useSharedDataGrid(useSearchParams(), columns);
 *
 * <DataGrid store={store} columns={columns} rows={rows} size={total} />
 * ```
 *
 * Column keys double as parameter names, so a column may not use `page`,
 * `limit`, `sort`, `order` or `selected` as its key.
 *
 * @param searchParams The tuple from React Router's `useSearchParams()`.
 * @param columns The same column definitions the grid receives. Memoize them:
 * a fresh array on every render recomputes the derived state every render.
 */
export function useSharedDataGrid<TData extends DataGridRow>(
  [searchParams, setSearchParams]: [URLSearchParams, SetURLSearchParams],
  columns: DataGridColumn<TData>[]
): DataGridReducer {
  const setPagination: DataGridReducer["setPagination"] = useCallback(
    (page, limit) => {
      setSearchParams((params) => {
        params.set("page", String(page));
        params.set("limit", String(limit));

        return params;
      });
    },
    [setSearchParams]
  );

  const setSorting: DataGridReducer["setSorting"] = useCallback(
    (sort, order) => {
      setSearchParams((params) => {
        if (sort === null || sort === undefined) {
          params.delete("sort");
        } else {
          params.set("sort", sort);
        }

        if (order === null || order === undefined) {
          params.delete("order");
        } else {
          params.set("order", order);
        }

        return params;
      });
    },
    [setSearchParams]
  );

  const setFilter: DataGridReducer["setFilter"] = useCallback(
    (filter) => {
      setSearchParams((params) => {
        deleteFilterKeys(params);
        writeFilter(params, filter);

        return params;
      });
    },
    [setSearchParams]
  );

  const setSelected: DataGridReducer["setSelected"] = useCallback(
    (selected) => {
      setSearchParams((params) => {
        writeSelected(params, selected);

        return params;
      });
    },
    [setSearchParams]
  );

  const setState: DataGridReducer["setState"] = useCallback(
    (state) => {
      setSearchParams((params) => {
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

        return params;
      });
    },
    [setSearchParams]
  );

  const columnFilter = useMemo(() => {
    assertNoReservedKeys(columns);

    return readColumnFilter(searchParams, columns);
  }, [columns, searchParams]);

  /**
   * The state as the URL alone describes it, before any column has had a say.
   */
  const rawState = useMemo<DataGridState>(() => {
    const order = searchParams.get("order");

    return {
      page: readPositiveInt(searchParams, "page", DATAGRID_DEFAULT_PAGE),
      limit: readPositiveInt(searchParams, "limit", DATAGRID_DEFAULT_LIMIT),
      sort: searchParams.get("sort") || DATAGRID_DEFAULT_SORT,
      // Anything that is not exactly one of the two orders the grid writes is
      // treated as no order at all. The public type promises `"asc" | "desc" |
      // null`, and a URL is typed by nobody.
      order: order === DATAGRID_SORT_ASC || order === DATAGRID_SORT_DESC ? order : DATAGRID_DEFAULT_ORDER,
      filter: columnFilter,
      selected: searchParams.getAll("selected"),
    };
  }, [columnFilter, searchParams]);

  /**
   * `deriveState` is applied here rather than left to the grid, so the state
   * handed back already carries the filters a column enforces. Otherwise the
   * consumer's first request would go out without them and be discarded.
   */
  const derivedState = useMemo(() => calculateDerivedState(rawState, columns), [rawState, columns]);

  /**
   * Memoized deliberately, and not left to the React Compiler.
   *
   * The grid reads this object as an external store and writes back through it
   * when a column's `deriveState` disagrees with what it holds. A fresh object
   * on every render is the one documented way to turn that synchronization into
   * a loop, so the stability has to be in the source rather than an artifact of
   * how the package happens to be built.
   */
  return useMemo(
    () => ({
      ...derivedState,
      setPagination,
      setSorting,
      setFilter,
      setSelected,
      setState,
    }),
    [derivedState, setPagination, setSorting, setFilter, setSelected, setState]
  );
}
