import { SetURLSearchParams } from "react-router";
import { ExpectedAny } from "../types";
import { Dispatch, useCallback, useMemo } from "react";
import {
  DEFAULT_LIMIT,
  DEFAULT_ORDER,
  DEFAULT_PAGE,
  DEFAULT_SORT,
} from "../constants";
import {
  DataGridAction,
  DataGridColumn,
  DataGridCommand,
  DataGridState,
  SharedDataGridContext,
} from "@sovgut/datagrid";

const DATAGRID_INTERNAL_COMMAND_QUERY_PARAM = "_DGC";

/**
 * URL Search Parameters based state management hook for DataGrid
 *
 * @description
 * This hook synchronizes DataGrid state with URL search parameters, making it the source of truth.
 * It enables:
 * - URL-based state persistence
 * - Shareable URLs with grid state
 * - Browser history integration
 * - Deep linking support
 *
 * @param {[URLSearchParams, SetURLSearchParams]} searchParamsContext - URL search parameters context from react-router
 * @param {DataGridColumn[]} columns - Array of column definitions for the grid
 *
 * @returns {SharedDataGridContext} [state, dispatch] tuple for DataGrid state management
 *
 * @example
 * ```tsx
 * // In a component using react-router-dom
 * const [searchParams, setSearchParams] = useSearchParams();
 * const columns = useMemo<DataGridColumn[]>(() => [
 *   { key: 'id', multiple: false },
 *   { key: 'status', multiple: true }
 * ], []);
 *
 * const [dataGrid, setDataGrid] = useDataGridSearch(
 *   [searchParams, setSearchParams],
 *   columns
 * );
 *
 * return (
 *   <DataGrid
 *     context={[dataGrid, setDataGrid]}
 *     columns={columns}
 *   />
 * );
 * ```
 *
 * @remarks
 * - Uses URL parameters as the source of truth for grid state
 * - Automatically handles multi-select filters via multiple URL params
 * - Maintains grid state in URL for: pagination, sorting, filtering, and limits
 * - Preserves state across page reloads
 */
export function useSharedDataGrid(
  searchParamsContext: [URLSearchParams, SetURLSearchParams],
  columns: DataGridColumn[]
): SharedDataGridContext {
  const [searchParams, setSearchParams] = searchParamsContext;

  const onSearch: Dispatch<DataGridAction> = useCallback(
    (action) => {
      setSearchParams((prevParams) => {
        prevParams.set(
          DATAGRID_INTERNAL_COMMAND_QUERY_PARAM,
          String(action.command)
        );

        switch (action.command) {
          case DataGridCommand.SetPage: {
            if (typeof action.page === "undefined") {
              prevParams.delete("page");
              break;
            }

            prevParams.set("page", String(action.page));
            break;
          }
          case DataGridCommand.SetLimit: {
            if (typeof action.limit === "undefined") {
              prevParams.delete("limit");
              break;
            }

            prevParams.set("limit", String(action.limit));
            break;
          }
          case DataGridCommand.SetSort: {
            if (typeof action.sort === "undefined") {
              prevParams.delete("sort");
              break;
            }

            prevParams.set("sort", String(action.sort));
            break;
          }

          case DataGridCommand.SetOrder: {
            if (typeof action.order === "undefined") {
              prevParams.delete("order");
              break;
            }

            prevParams.set("order", String(action.order));
            break;
          }
          case DataGridCommand.SetFilter:
          case DataGridCommand.ReplaceFilter:
          case DataGridCommand.RemoveFilter: {
            for (const key in action.filter) {
              const column = columns.find((column) => column.key === key);
              const value = action.filter[key];

              if (typeof value === "undefined" || value === null) {
                prevParams.delete(key);
                continue;
              }

              if (column?.multiple) {
                prevParams.delete(key);
                (value as Array<unknown>).forEach((value) =>
                  prevParams.append(key, String(value))
                );
              } else prevParams.set(key, String(value));
            }

            prevParams.set("page", String(DEFAULT_PAGE));
            break;
          }
        }

        return prevParams;
      });
    },
    [columns, setSearchParams]
  );

  const state = useMemo<DataGridState>(() => {
    return {
      page: searchParams.has("page")
        ? Number(searchParams.get("page"))
        : DEFAULT_PAGE,
      limit: searchParams.has("limit")
        ? Number(searchParams.get("limit"))
        : DEFAULT_LIMIT,
      sort: searchParams.get("sort") || DEFAULT_SORT,
      order: (searchParams.get("order") as ExpectedAny) || DEFAULT_ORDER,
      command: searchParams.has(DATAGRID_INTERNAL_COMMAND_QUERY_PARAM)
        ? (Number(
            searchParams.get(DATAGRID_INTERNAL_COMMAND_QUERY_PARAM)
          ) as DataGridCommand)
        : undefined,
      filter: columns.reduce((acc, column) => {
        const key = column.key;

        if (searchParams.has(key)) {
          if (column.multiple) {
            acc[key] = searchParams.getAll(key) as ExpectedAny;
          } else {
            acc[column.key] = searchParams.get(key) as ExpectedAny;
          }
        }

        return acc;
      }, {} as Record<string, ExpectedAny>),
    };
  }, [columns, searchParams]);

  return [state, onSearch];
}
