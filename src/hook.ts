import { useCallback, useMemo, useState } from "react";
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

export function useSharedDataGrid<TData extends DataGridRow>(
  [searchParams, setSearchParams]: [URLSearchParams, SetURLSearchParams],
  columns: DataGridColumn<TData>[]
): DataGridReducer {
  const [selected, setSelected] = useState<DataGridState["selected"]>(DATAGRID_DEFAULT_SELECTED);

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
        console.log("arguments", { sort, order });
        console.log("before update", Array.from(state.entries()));
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

        console.log("after update", Array.from(state.entries()));

        return state;
      });
    },
    [setSearchParams]
  );

  const setFilter = useCallback(
    (filter: DataGridState["filter"]) => {
      setSearchParams((state) => {
        const currentStateKeys = Array.from(state.keys());
        const currentFilterKeys = currentStateKeys.filter((key) => !["page", "limit", "sort", "order"].includes(key));
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

  const setState = useCallback(
    (state: DataGridState) => {
      setSelected(state.selected ?? DATAGRID_DEFAULT_SELECTED);
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
        const currentFilterKeys = currentStateKeys.filter((key) => !["page", "limit", "sort", "order"].includes(key));
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

  return {
    selected,
    page: searchParams.has("page") ? Number(searchParams.get("page")) : DATAGRID_DEFAULT_PAGE,
    limit: searchParams.has("limit") ? Number(searchParams.get("limit")) : DATAGRID_DEFAULT_LIMIT,
    sort: searchParams.get("sort") || DATAGRID_DEFAULT_SORT,
    order: (searchParams.get("order") as DataGridState["order"]) || DATAGRID_DEFAULT_ORDER,
    filter: memoizedFilter,
    setPagination,
    setSorting,
    setFilter,
    setSelected,
    setState,
  };
}
