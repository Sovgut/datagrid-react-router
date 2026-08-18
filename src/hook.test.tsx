import type { DataGridColumn, DataGridReducer, DataGridRow } from "@sovgut/datagrid";
import { act, render } from "@testing-library/react";
import { type ReactElement, useCallback, useMemo, useState } from "react";
import type { NavigateOptions, SetURLSearchParams } from "react-router";
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
 * A stand-in for `useSearchParams`, reproducing the three properties of the
 * real hook that this code depends on. They were read off React Router's
 * source rather than assumed:
 *
 * 1. an updater function receives a **fresh** `URLSearchParams` built from the
 *    current one, which is why mutating it in place is safe here;
 * 2. whatever the updater returns is passed through the `URLSearchParams`
 *    constructor again rather than stored as-is;
 * 3. the params object is memoized on the query string, so its identity is
 *    stable across renders that do not change the URL;
 * 4. the setter is `useCallback(..., [navigate, searchParams])`, so its
 *    identity changes exactly when the query string does. Reproducing this
 *    matters: a permanently stable setter would make the hook look more
 *    memoization-friendly here than it is in an application.
 *
 * Testing against a real router would be testing React Router: this package
 * imports only a type from it and has no runtime link. `router.test.tsx`
 * guards against this harness drifting from reality.
 */
function useFakeSearchParams(
  initial: string,
  onNavigate: (options: NavigateOptions | undefined) => void
): [URLSearchParams, SetURLSearchParams] {
  const [query, setQuery] = useState(initial);
  const params = useMemo(() => new URLSearchParams(query), [query]);

  const setParams: SetURLSearchParams = useCallback(
    (next, options) => {
      const resolved = typeof next === "function" ? next(new URLSearchParams(params)) : next;

      onNavigate(options);
      setQuery(new URLSearchParams(resolved as URLSearchParams).toString());
    },
    [params, onNavigate]
  );

  return [params, setParams];
}

interface HarnessResult {
  store: DataGridReducer;
  query: string;
  identities: DataGridReducer[];
  navigations: (NavigateOptions | undefined)[];
}

function renderHook(initialQuery = "", cols: DataGridColumn<Row>[] = columns) {
  const result: HarnessResult = { store: null as never, query: "", identities: [], navigations: [] };
  const record = (options: NavigateOptions | undefined): void => {
    result.navigations.push(options);
  };

  function Probe(): ReactElement {
    const [params, setParams] = useFakeSearchParams(initialQuery, record);
    const store = useSharedDataGrid<Row>([params, setParams], cols);

    result.store = store;
    result.query = params.toString();
    result.identities.push(store);

    return <span />;
  }

  const view = render(<Probe />);

  return { result, rerender: () => view.rerender(<Probe />) };
}

describe("reading state out of the URL", () => {
  it("falls back to the package defaults for an empty query", () => {
    const { result } = renderHook();

    expect(result.store).toMatchObject({
      page: 1,
      limit: 10,
      sort: null,
      order: null,
      filter: {},
      selected: [],
    });
  });

  it("reads every field the grid owns", () => {
    const { result } = renderHook("page=3&limit=25&sort=name&order=desc&selected=7&selected=9");

    expect(result.store).toMatchObject({
      page: 3,
      limit: 25,
      sort: "name",
      order: "desc",
      selected: ["7", "9"],
    });
  });

  it("falls back when page or limit is not a positive integer", () => {
    const { result } = renderHook("page=abc&limit=0");

    expect(result.store).toMatchObject({ page: 1, limit: 10 });
  });

  it("treats an order it did not write as no order at all", () => {
    expect(renderHook("order=ASC").result.store.order).toBe(null);
    expect(renderHook("order=sideways").result.store.order).toBe(null);
    expect(renderHook("order=asc").result.store.order).toBe("asc");
  });

  it("collects only declared columns into the filter", () => {
    const { result } = renderHook("status=active&bank=a&bank=b&stray=1");

    expect(result.store.filter).toEqual({ status: "active", bank: ["a", "b"] });
  });

  it("applies deriveState before handing the state back", () => {
    // The point of doing this here rather than leaving it to the grid: the
    // consumer's first request must already carry the enforced filter.
    const derived: DataGridColumn<Row>[] = [
      {
        key: "scope",
        label: "Scope",
        filterConfig: {
          deriveState: (context) => ({ ...context, filter: { ...context.filter, scope: "mine" } }),
        },
      },
    ];

    expect(renderHook("", derived).result.store.filter).toEqual({ scope: "mine" });
  });
});

describe("writing state into the URL", () => {
  it("setPagination writes both keys", () => {
    const { result } = renderHook("sort=name");

    act(() => result.store.setPagination(4, 50));

    expect(result.store).toMatchObject({ page: 4, limit: 50, sort: "name" });
  });

  it("setSorting writes, clears on null, and clears on undefined", () => {
    const { result } = renderHook();

    act(() => result.store.setSorting("name", "asc"));
    expect(result.query).toContain("sort=name");
    expect(result.query).toContain("order=asc");

    act(() => result.store.setSorting(null, null));
    expect(result.query).not.toContain("sort");
    expect(result.query).not.toContain("order");

    act(() => result.store.setSorting("name", "asc"));
    // The reducer's own signature accepts `undefined`, so this one has to as
    // well or the package does not compile against it.
    act(() => result.store.setSorting(undefined, undefined));
    expect(result.query).not.toContain("sort");
    expect(result.query).not.toContain("order");
  });

  it("setFilter replaces the filter wholesale and leaves the grid's keys alone", () => {
    const { result } = renderHook("page=3&limit=25&sort=name&order=asc&selected=1&status=old&bank=x");

    act(() => result.store.setFilter({ status: "new" }));

    expect(result.store.filter).toEqual({ status: "new" });
    expect(result.query).not.toContain("bank");
    expect(result.store).toMatchObject({ page: 3, limit: 25, sort: "name", order: "asc", selected: ["1"] });
  });

  it("setFilter skips nullish values instead of throwing on them", () => {
    const { result } = renderHook();

    // A nullish value means "no filter"; calling `.toString()` on it throws.
    expect(() => act(() => result.store.setFilter({ status: undefined, bank: null, extra: "x" }))).not.toThrow();
    expect(result.query).toBe("extra=x");
  });

  it("setFilter with an empty object clears every filter parameter", () => {
    const { result } = renderHook("status=a&bank=b&page=2");

    act(() => result.store.setFilter({}));

    expect(result.store.filter).toEqual({});
    expect(result.store.page).toBe(2);
  });

  it("setSelected replaces and clears the selection", () => {
    const { result } = renderHook("selected=1");

    act(() => result.store.setSelected(["7", "8"]));
    expect(result.store.selected).toEqual(["7", "8"]);

    act(() => result.store.setSelected([]));
    expect(result.store.selected).toEqual([]);
    expect(result.query).not.toContain("selected");
  });

  it("setState writes the sort it is given", () => {
    const { result } = renderHook();

    act(() =>
      result.store.setState({
        page: 1,
        limit: 10,
        sort: "amount",
        order: "desc",
        filter: {},
        selected: ["3"],
      })
    );

    expect(result.store).toMatchObject({ sort: "amount", order: "desc", selected: ["3"] });
  });

  it("setState writes the whole state and drops what is absent", () => {
    const { result } = renderHook("status=stale&selected=9");

    act(() =>
      result.store.setState({
        page: 2,
        limit: 25,
        sort: null,
        order: null,
        filter: { status: "fresh", bank: ["a", undefined as never], skipped: undefined },
        selected: [],
      })
    );

    expect(result.store).toMatchObject({ page: 2, limit: 25, sort: null, order: null, selected: [] });
    expect(result.store.filter).toEqual({ status: "fresh", bank: ["a"] });
    expect(result.query).not.toContain("skipped");
    expect(result.query).not.toContain("selected");
  });
});

describe("identity of the returned store", () => {
  it("stays stable across a render that does not change the URL", () => {
    const { result, rerender } = renderHook("page=2");

    act(() => rerender());

    expect(result.identities.length).toBeGreaterThan(1);
    expect(result.identities.at(-1)).toBe(result.identities[0]);
  });

  it("changes once the URL changes", () => {
    const { result } = renderHook();
    const before = result.store;

    act(() => result.store.setPagination(5, 10));

    expect(result.store).not.toBe(before);
  });
});

describe("reserved column keys", () => {
  it.each(["page", "limit", "sort", "order", "selected"])("refuses a column keyed %s", (key) => {
    // Silent and destructive otherwise: writing the filter would `set` the
    // reserved parameter, and `deleteFilterKeys` would never clear it.
    expect(() => renderHook("", [{ key, label: key }])).toThrow(RangeError);
  });
});

describe("the SetURLSearchParams contract", () => {
  it("mutating the params handed to the updater does not touch the rendered object", () => {
    const { result } = renderHook("page=2");
    const rendered = result.query;

    act(() => result.store.setFilter({ status: "x" }));

    // The updater got a copy, so the object the component rendered with is
    // untouched even though the setter mutates its argument in place.
    expect(rendered).toBe("page=2");
  });
});

/**
 * `bank` only means anything while a `status` is chosen, so the column drops it
 * as soon as the status is gone. This is the shape of `deriveState` that
 * disagrees with the URL: the filter leaves the state without leaving the query
 * string.
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

describe("keeping the URL in agreement with the derived state", () => {
  it("removes a parameter a column dropped", () => {
    const { result } = renderHook("bank=ghost", dependent);

    expect(result.store.filter).toEqual({});
    // The repair writes the divergence and nothing else, so a `page` the reader
    // never wrote is not filled in on the way past.
    expect(result.query).toBe("");
  });

  it("leaves the parameters of the rest of the application alone", () => {
    const { result } = renderHook("tab=details&bank=ghost", dependent);

    expect(result.query).toBe("tab=details");
  });

  it("adds a parameter a column enforces", () => {
    const enforced: DataGridColumn<Row>[] = [
      {
        key: "scope",
        label: "Scope",
        filterConfig: {
          deriveState: (context) => ({ ...context, filter: { ...context.filter, scope: "mine" } }),
        },
      },
    ];

    const { result } = renderHook("", enforced);

    expect(result.query).toContain("scope=mine");
  });

  it("corrects the URL after a write the column overrides", () => {
    const { result } = renderHook("status=active&bank=x", dependent);

    act(() => result.store.setFilter({ bank: "x" }));

    expect(result.store.filter).toEqual({});
    expect(result.query).not.toContain("bank");
  });

  it("replaces the entry rather than pushing a second one", () => {
    const { result } = renderHook("bank=ghost", dependent);

    expect(result.navigations).toEqual([{ replace: true }]);
  });

  it("leaves a URL no column disagrees with exactly as it is", () => {
    const { result } = renderHook("bank=x&status=active", dependent);

    expect(result.query).toBe("bank=x&status=active");
    expect(result.navigations).toEqual([]);
  });

  it("does not normalize a URL that has no deriveState behind it", () => {
    const { result } = renderHook("page=2");

    expect(result.query).toBe("page=2");
    expect(result.navigations).toEqual([]);
  });

  it("writes once for a divergence the URL cannot express", () => {
    // `ghost` belongs to no column, so it is never read back and the state
    // stays different from the URL forever. Comparing query strings is what
    // stops that from being an endless sequence of navigations.
    const ghostly: DataGridColumn<Row>[] = [
      {
        key: "status",
        label: "Status",
        filterConfig: {
          deriveState: (context) => ({ ...context, filter: { ...context.filter, ghost: "1" } }),
        },
      },
    ];

    const { result } = renderHook("", ghostly);

    expect(result.store.filter).toEqual({ ghost: "1" });
    expect(result.query).toContain("ghost=1");
    expect(result.navigations).toHaveLength(1);
  });
});

describe("columns that are rebuilt on every render", () => {
  it("repairs the URL once instead of navigating on every render", () => {
    // A fresh column array every render is documented as a performance mistake.
    // It must not also be a correctness one: the repair compares by value, so a
    // new array describing the same columns settles after a single write.
    const seen = { query: "", navigations: [] as (NavigateOptions | undefined)[], renders: 0 };

    function Probe(): ReactElement {
      const [params, setParams] = useFakeSearchParams("", (options) => {
        seen.navigations.push(options);
      });

      useSharedDataGrid<Row>(
        [params, setParams],
        [
          {
            key: "scope",
            label: "Scope",
            filterConfig: {
              deriveState: (context) => ({ ...context, filter: { ...context.filter, scope: "mine" } }),
            },
          },
        ]
      );

      seen.query = params.toString();
      seen.renders += 1;

      return <span />;
    }

    render(<Probe />);

    expect(seen.query).toBe("scope=mine");
    expect(seen.navigations).toEqual([{ replace: true }]);
    expect(seen.renders).toBe(2);
  });
});
