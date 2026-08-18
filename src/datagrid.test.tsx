import { DataGrid, type DataGridColumn, type DataGridReducer, type DataGridRow, useDataGrid } from "@sovgut/datagrid";
import { act, render } from "@testing-library/react";
// `StrictMode` is reached through the namespace: the linter's resolver does not
// see it as a named export of `react`.
import * as React from "react";
import { type ReactElement, useMemo } from "react";
import { MemoryRouter, useLocation, useSearchParams } from "react-router";
import { describe, expect, it } from "vitest";

import { useSharedDataGrid } from "./hook.ts";

interface Row extends DataGridRow {
  id: number;
}

const rows: Row[] = [{ id: 1 }, { id: 2 }];

/**
 * `bank` only means anything while a `status` is chosen, so the column drops it
 * as soon as the status is gone - the shape of every dependent pair of filters:
 * an operator that the chosen currency no longer offers, a cashier outside the
 * chosen merchant.
 */
const columns: DataGridColumn<Row>[] = [
  { key: "status", label: "Status" },
  {
    key: "bank",
    label: "Bank",
    filterConfig: {
      deriveState: (context) => {
        if (context.filter.status) {
          return context;
        }

        const filter = { ...context.filter };

        delete filter.bank;

        return { ...context, filter };
      },
    },
  },
];

interface Seen {
  /** What the grid holds, read from inside its own context. */
  grid: DataGridReducer;
  /** What the hook returned, which is what a consumer builds a request from. */
  store: DataGridReducer;
  search: string;
  renders: number;
}

/**
 * The hook driving a real `<DataGrid>` through a real router, which is the only
 * place the two halves of the state can disagree: the grid repairs its own
 * store when a column derives a different state, and never sees a disagreement
 * here, because the hook hands it a state that is already derived.
 */
function renderGrid(initialQuery: string, wrapper: "strict" | "plain" = "plain") {
  const seen: Seen = { grid: null as never, store: null as never, search: "", renders: 0 };

  function Probe(): ReactElement {
    seen.grid = useDataGrid<Row>();

    return <span />;
  }

  function Table(): ReactElement {
    const memoized = useMemo(() => columns, []);
    const store = useSharedDataGrid<Row>(useSearchParams(), memoized);

    seen.store = store;
    seen.search = useLocation().search;
    seen.renders += 1;

    return (
      <DataGrid store={store} columns={memoized} rows={rows} size={rows.length}>
        <Probe />
      </DataGrid>
    );
  }

  const tree = (
    <MemoryRouter initialEntries={[`/${initialQuery}`]}>
      <Table />
    </MemoryRouter>
  );

  render(wrapper === "strict" ? <React.StrictMode>{tree}</React.StrictMode> : tree);

  return seen;
}

describe("driving a real grid", () => {
  it("agrees with the grid about the state a column derived", () => {
    const seen = renderGrid("?bank=ghost");

    expect(seen.store.filter).toEqual({});
    expect(seen.grid.filter).toEqual({});
    expect(seen.search).not.toContain("bank");
  });

  it("clears the parameter when the grid's own setter removes what justified it", () => {
    const seen = renderGrid("?status=active&bank=x");

    expect(seen.search).toContain("bank=x");

    act(() => seen.grid.setFilter({ bank: "x" }));

    expect(seen.store.filter).toEqual({});
    expect(seen.grid.filter).toEqual({});
    expect(seen.search).not.toContain("bank");
  });

  it("clears the parameter when the store is written to directly", () => {
    // The path a filter control takes when it holds the store rather than the
    // grid's context: nothing derives the state on the way in, so the parameter
    // reaches the URL and has to be taken back out.
    const seen = renderGrid("?status=active&bank=x");

    act(() => seen.store.setFilter({ bank: "x" }));

    expect(seen.store.filter).toEqual({});
    expect(seen.grid.filter).toEqual({});
    expect(seen.search).not.toContain("bank");
  });

  it("settles instead of trading writes with the grid", () => {
    const seen = renderGrid("?bank=ghost");
    const settled = seen.renders;

    act(() => seen.grid.setPagination(2, 25));

    // The grid repairs its store and the hook repairs the URL, both from the
    // same derived state. Arriving on a URL a column disagrees with costs one
    // extra render and nothing after that: the write settles the disagreement
    // instead of handing it back.
    expect(settled).toBe(2);
    expect(seen.renders - settled).toBe(1);
    expect(seen.search).toContain("page=2");
    expect(seen.search).not.toContain("bank");
  });

  it("repairs the URL exactly once under StrictMode's double invocation", () => {
    const seen = renderGrid("?bank=ghost", "strict");

    expect(seen.search).not.toContain("bank");
    expect(seen.store.filter).toEqual({});
  });
});
