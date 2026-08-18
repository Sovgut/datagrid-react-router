import type { DataGridColumn, DataGridReducer, DataGridRow } from "@sovgut/datagrid";
import { act, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, useLocation, useNavigate, useSearchParams } from "react-router";
import { describe, expect, it } from "vitest";

import { useSharedDataGrid } from "./hook.ts";

interface Row extends DataGridRow {
  id: number;
}

const columns: DataGridColumn<Row>[] = [
  { key: "status", label: "Status" },
  { key: "bank", label: "Bank", multiple: true },
];

/**
 * The rest of the suite runs against a hand-written stand-in for
 * `useSearchParams`, because this package imports only a type from React
 * Router and has no runtime link to it. That stand-in is only worth anything
 * while it still matches the real hook.
 *
 * This file is the guard: the same operations, driven through a real
 * `MemoryRouter`, asserted on the resulting query string. If React Router ever
 * changes how an updater is called or how the result is normalized, this fails
 * and the stand-in gets corrected.
 */
describe("against a real router", () => {
  it("round-trips the state through the actual search params", () => {
    const seen = { store: null as unknown as DataGridReducer, search: "" };

    function Probe(): ReactElement {
      seen.store = useSharedDataGrid<Row>(useSearchParams(), columns);
      seen.search = useLocation().search;

      return <span />;
    }

    render(
      <MemoryRouter initialEntries={["/?page=2&limit=25&status=old&bank=x"]}>
        <Probe />
      </MemoryRouter>
    );

    expect(seen.store).toMatchObject({ page: 2, limit: 25 });
    expect(seen.store.filter).toEqual({ status: "old", bank: ["x"] });

    act(() => seen.store.setSorting("name", "asc"));
    expect(seen.store).toMatchObject({ sort: "name", order: "asc", page: 2 });

    act(() => seen.store.setFilter({ status: "new", bank: ["a", "b"], skipped: undefined }));
    expect(seen.store.filter).toEqual({ status: "new", bank: ["a", "b"] });
    expect(seen.search).not.toContain("skipped");

    act(() => seen.store.setSelected(["3"]));
    expect(seen.store.selected).toEqual(["3"]);

    act(() => seen.store.setSorting(null, null));
    expect(seen.search).not.toContain("sort=");
    expect(seen.search).not.toContain("order=");
  });
});

/**
 * `bank` only means anything while a `status` is chosen, so the column drops it
 * as soon as the status is gone.
 */
const dependent: DataGridColumn<Row>[] = [
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

describe("repairing a query string a column disagrees with", () => {
  it("rewrites the address in place, leaving nothing to go back to", () => {
    const seen = { pathname: "", search: "", back: null as unknown as () => void };

    function Probe(): ReactElement {
      const navigate = useNavigate();
      const location = useLocation();

      useSharedDataGrid<Row>(useSearchParams(), dependent);

      seen.pathname = location.pathname;
      seen.search = location.search;
      seen.back = () => navigate(-1);

      return <span />;
    }

    render(
      <MemoryRouter initialEntries={["/elsewhere", "/?bank=ghost"]} initialIndex={1}>
        <Probe />
      </MemoryRouter>
    );

    expect(seen.search).not.toContain("bank");

    act(() => seen.back());

    // The repair replaced the entry it corrected. Had it pushed one, this step
    // back would land on the uncorrected `/?bank=ghost` and repair it again.
    expect(seen.pathname).toBe("/elsewhere");
  });
});
