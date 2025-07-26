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
  context: [URLSearchParams, SetURLSearchParams],
  columns: DataGridColumn<TData>[]
): DataGridReducer {
  const [searchParams, setSearchParams] = context;
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
        if (isNullish(sort)) {
          state.delete("sort");
        } else {
          state.set("sort", sort.toString());
        }

        if (isNullish(order)) {
          state.delete("order");
        } else {
          state.set("order", order.toString());
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
        const currentFilterKeys = currentStateKeys.filter((key) => !["page", "limit", "sort", "order"].includes(key));
        const receivedFilterKeys = Object.keys(filter);

        for (const key of currentFilterKeys) {
          if (!receivedFilterKeys.includes(key)) {
            state.delete(key);
          }
        }

        for (const key of receivedFilterKeys) {
          state.set(key, filter[key].toString());
        }

        return state;
      });
    },
    [setSearchParams]
  );

  const state = useMemo<DataGridState>(() => {
    return {
      page: searchParams.has("page") ? Number(searchParams.get("page")) : DATAGRID_DEFAULT_PAGE,
      limit: searchParams.has("limit") ? Number(searchParams.get("limit")) : DATAGRID_DEFAULT_LIMIT,
      sort: searchParams.get("sort") || DATAGRID_DEFAULT_SORT,
      order: (searchParams.get("order") as DataGridState["order"]) || DATAGRID_DEFAULT_ORDER,
      filter: columns.reduce(
        (acc, column) => {
          const key = column.key as string;

          if (searchParams.has(key)) {
            if (column.multiple) {
              acc[key] = searchParams.getAll(key) as ExpectedAny;
            } else {
              acc[key] = searchParams.get(key) as ExpectedAny;
            }
          }

          return acc;
        },
        DATAGRID_DEFAULT_FILTER as Record<string, ExpectedAny>
      ),
      selected: selected,
    };
  }, [columns, searchParams, selected]);

  return {
    page: state.page,
    limit: state.limit,
    sort: state.sort,
    order: state.order,
    filter: state.filter,
    selected: state.selected,
    setPagination,
    setSorting,
    setFilter,
    setSelected,
  };
}
