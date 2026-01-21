import { useCallback, useMemo } from "react";
import { type SetURLSearchParams } from "react-router-dom";
import {
  type DataGridColumn,
  type DataGridReducer,
  type DataGridRow,
  type DataGridState,
  DATAGRID_DEFAULT_PAGE,
  DATAGRID_DEFAULT_SELECTED,
  DATAGRID_DEFAULT_LIMIT,
  DATAGRID_DEFAULT_SORT,
  DATAGRID_DEFAULT_ORDER,
  DATAGRID_DEFAULT_FILTER,
} from "@sovgut/datagrid";
import { isNullish } from "utility-types";
import type { ExpectedAny } from "./types.ts";

/**
 * Helper to deep copy objects to avoid mutation issues during state derivation.
 * Simple implementation to avoid external dependencies if not available.
 */
function deepCopy<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Calculates the final state by applying any deriveState logic defined in columns.
 */
function calculateDerivedState<TData>(initialState: DataGridState, columns: DataGridColumn<TData>[]): DataGridState {
  let currentState = deepCopy(initialState);

  for (const column of columns) {
    if (typeof column.filterConfig?.deriveState === "function") {
      currentState = column.filterConfig.deriveState(currentState);
    }
  }

  return currentState;
}

export function useSharedDataGrid<TData extends DataGridRow>(
  [searchParams, setSearchParams]: [URLSearchParams, SetURLSearchParams],
  columns: DataGridColumn<TData>[]
): DataGridReducer {
  const setPagination = useCallback(
    (page: DataGridState["page"], limit: DataGridState["limit"]) => {
      setSearchParams((state) => {
        state.set("page", page.toString());
        state.set("limit", limit.toString());

        return state;
      });
    },
    [setSearchParams]
  );

  const setSorting = useCallback(
    (sort: DataGridState["sort"], order: DataGridState["order"]) => {
      setSearchParams((state) => {
        if (isNullish(sort)) {
          state.delete("sort");
        } else {
          state.set("sort", sort?.toString() ?? "");
        }

        if (isNullish(order)) {
          state.delete("order");
        } else {
          state.set("order", order?.toString() ?? "");
        }

        return state;
      });
    },
    [setSearchParams]
  );

  const setFilter = useCallback(
    (filter: DataGridState["filter"]) => {
      setSearchParams((state) => {
        const currentStateKeys = Array.from(state.keys());
        const currentFilterKeys = currentStateKeys.filter(
          (key) => !["page", "limit", "sort", "order", "selected"].includes(key)
        );
        const receivedFilterKeys = Object.keys(filter);

        for (const key of currentFilterKeys) {
          state.delete(key);
        }

        for (const key of receivedFilterKeys) {
          if (Array.isArray(filter[key])) {
            for (const value of filter[key]) {
              state.append(key, value.toString());
            }
          } else {
            state.set(key, filter[key].toString());
          }
        }

        return state;
      });
    },
    [setSearchParams]
  );

  const setSelected = useCallback(
    (selected: DataGridState["selected"]) => {
      setSearchParams((state) => {
        state.delete("selected");

        if (selected && selected.length > 0) {
          for (const value of selected) {
            state.append("selected", value.toString());
          }
        }
        return state;
      });
    },
    [setSearchParams]
  );

  const setState = useCallback(
    (state: DataGridState) => {
      setSearchParams((search) => {
        search.set("page", state.page.toString());
        search.set("limit", state.limit.toString());

        if (isNullish(state.sort)) {
          search.delete("sort");
        } else {
          search.set("sort", state.sort?.toString());
        }

        if (isNullish(state.order)) {
          search.delete("order");
        } else {
          search.set("order", state.order?.toString());
        }

        const currentStateKeys = Array.from(search.keys());
        const currentFilterKeys = currentStateKeys.filter(
          (key) => !["page", "limit", "sort", "order", "selected"].includes(key)
        );
        const receivedFilterKeys = Object.keys(state.filter);

        for (const key of currentFilterKeys) {
          search.delete(key);
        }

        for (const key of receivedFilterKeys) {
          if (!isNullish(state.filter[key])) {
            if (Array.isArray(state.filter[key])) {
              for (const value of state.filter[key]) {
                if (!isNullish(value)) {
                  search.append(key, value.toString());
                }
              }
            } else {
              search.set(key, state.filter[key].toString());
            }
          }
        }

        search.delete("selected");
        if (state.selected && state.selected.length > 0) {
          for (const value of state.selected) {
            if (!isNullish(value)) {
              search.append("selected", value.toString());
            }
          }
        }

        return search;
      });
    },
    [setSearchParams]
  );

  const memoizedFilter = useMemo(() => {
    return columns.reduce((acc, column) => {
      const key = column.key as string;

      if (searchParams.has(key)) {
        return {
          ...acc,
          [key]: column.multiple ? (searchParams.getAll(key) as ExpectedAny) : (searchParams.get(key) as ExpectedAny),
        };
      }

      return acc;
    }, DATAGRID_DEFAULT_FILTER);
  }, [columns, searchParams]);

  /**
   * We construct the "raw" state based solely on URL parameters.
   */
  const rawState = useMemo(() => {
    const selected = searchParams.getAll("selected") ?? DATAGRID_DEFAULT_SELECTED;

    return {
      selected,
      page: searchParams.has("page") ? Number(searchParams.get("page")) : DATAGRID_DEFAULT_PAGE,
      limit: searchParams.has("limit") ? Number(searchParams.get("limit")) : DATAGRID_DEFAULT_LIMIT,
      sort: searchParams.get("sort") || DATAGRID_DEFAULT_SORT,
      order: (searchParams.get("order") as DataGridState["order"]) || DATAGRID_DEFAULT_ORDER,
      filter: memoizedFilter,
    };
  }, [memoizedFilter, searchParams]);

  /**
   * We apply the `deriveState` logic immediately here.
   * This ensures that the state returned to `useQuery` in the parent component
   * ALREADY contains the implicit filters (e.g. organization_user=1).
   * This prevents the initial "empty" fetch.
   */
  const derivedState = useMemo(() => {
    return calculateDerivedState(rawState, columns);
  }, [rawState, columns]);

  return {
    ...derivedState,
    setPagination,
    setSorting,
    setFilter,
    setSelected,
    setState,
  };
}
