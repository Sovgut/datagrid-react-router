// @vitest-environment node

import type { DataGridColumn, DataGridRow, DataGridState } from "@sovgut/datagrid";
import { describe, expect, it } from "vitest";

import {
  applyStateDiff,
  calculateDerivedState,
  cloneDataGridState,
  DATAGRID_RESERVED_KEYS,
  deleteFilterKeys,
  isFilterEqual,
  isSameQuery,
  isSelectedEqual,
  isStateEqual,
  readColumnFilter,
  readPositiveInt,
  writeFilter,
  writeSelected,
  writeState,
} from "./utils.ts";

interface Row extends DataGridRow {
  id: number;
}

function state(overrides: Partial<DataGridState> = {}): DataGridState {
  return {
    page: 1,
    limit: 10,
    sort: null,
    order: null,
    filter: {},
    selected: [],
    ...overrides,
  };
}

describe("cloneDataGridState", () => {
  it("isolates the assignments and deletions a deriveState performs", () => {
    const source = state({ filter: { currency: "USD", method: "1" }, selected: ["a"] });
    const clone = cloneDataGridState(source);

    clone.filter.method = undefined;
    delete clone.filter.currency;
    clone.selected.push("b");
    clone.page = 5;

    expect(source.filter).toEqual({ currency: "USD", method: "1" });
    expect(source.selected).toEqual(["a"]);
    expect(source.page).toBe(1);
  });

  it("shares values nested inside a filter entry by reference", () => {
    const nested = { from: "2026-01-01" };
    const clone = cloneDataGridState(state({ filter: { range: nested } }));

    expect(clone.filter.range).toBe(nested);
  });

  it("normalizes a missing filter or selection to an empty one", () => {
    const clone = cloneDataGridState(state({ filter: undefined as never, selected: undefined as never }));

    expect(clone.filter).toEqual({});
    expect(clone.selected).toEqual([]);
  });

  it("survives values a JSON round trip would not", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(() => cloneDataGridState(state({ filter: { cyclic } }))).not.toThrow();
  });
});

describe("calculateDerivedState", () => {
  it("returns a copy when no column derives anything", () => {
    const source = state({ filter: { a: "1" } });
    const columns: DataGridColumn<Row>[] = [
      { key: "a", label: "A" },
      { key: "b", label: "B", filterConfig: {} },
    ];

    const result = calculateDerivedState(source, columns);

    expect(result).toEqual(source);
    expect(result).not.toBe(source);
    expect(result.filter).not.toBe(source.filter);
  });

  it("chains column by column, each one seeing the previous result", () => {
    const columns: DataGridColumn<Row>[] = [
      { key: "first", label: "First", filterConfig: { deriveState: (c) => ({ ...c, filter: { trail: "a" } }) } },
      { key: "plain", label: "Plain" },
      {
        key: "second",
        label: "Second",
        filterConfig: { deriveState: (c) => ({ ...c, filter: { trail: `${c.filter.trail}b` } }) },
      },
    ];

    expect(calculateDerivedState(state(), columns).filter).toEqual({ trail: "ab" });
  });

  it("does not let a mutating deriveState reach the input", () => {
    const source = state({ filter: { scope: "all" } });
    const columns: DataGridColumn<Row>[] = [
      {
        key: "scope",
        label: "Scope",
        filterConfig: {
          deriveState: (context) => {
            context.filter.scope = "mine";

            return context;
          },
        },
      },
    ];

    expect(calculateDerivedState(source, columns).filter).toEqual({ scope: "mine" });
    expect(source.filter).toEqual({ scope: "all" });
  });
});

describe("deleteFilterKeys", () => {
  it("keeps the grid's own keys and drops everything else", () => {
    const params = new URLSearchParams("page=2&limit=25&sort=name&order=asc&selected=1&status=active&bank=x&bank=y");

    deleteFilterKeys(params);

    expect(params.toString()).toBe("page=2&limit=25&sort=name&order=asc&selected=1");
  });

  it("lists exactly the five reserved names", () => {
    expect(DATAGRID_RESERVED_KEYS).toEqual(["page", "limit", "sort", "order", "selected"]);
  });
});

describe("writeFilter", () => {
  it("writes scalars and repeats array values", () => {
    const params = new URLSearchParams();

    writeFilter(params, { status: "active", bank: ["a", "b"], count: 3 });

    expect(params.getAll("bank")).toEqual(["a", "b"]);
    expect(params.get("status")).toBe("active");
    expect(params.get("count")).toBe("3");
  });

  it("skips nullish entries instead of serializing them", () => {
    const params = new URLSearchParams();

    writeFilter(params, { a: undefined, b: null, c: "x" });

    expect(params.toString()).toBe("c=x");
  });

  it("skips nullish elements inside an array value", () => {
    const params = new URLSearchParams();

    writeFilter(params, { bank: ["a", undefined, null, "b"] });

    expect(params.getAll("bank")).toEqual(["a", "b"]);
  });

  it("writes an empty string, which is a value and not an absence", () => {
    const params = new URLSearchParams();

    writeFilter(params, { q: "" });

    expect(params.has("q")).toBe(true);
  });

  it("tolerates a missing filter object", () => {
    const params = new URLSearchParams();

    expect(() => writeFilter(params, undefined as never)).not.toThrow();
    expect(params.toString()).toBe("");
  });
});

describe("writeSelected", () => {
  it("replaces the previous selection", () => {
    const params = new URLSearchParams("selected=1&selected=2&page=3");

    writeSelected(params, ["9"]);

    expect(params.getAll("selected")).toEqual(["9"]);
    expect(params.get("page")).toBe("3");
  });

  it("skips a nullish id rather than writing the string undefined", () => {
    const params = new URLSearchParams();

    writeSelected(params, ["1", undefined as never, null as never, "2"]);

    expect(params.getAll("selected")).toEqual(["1", "2"]);
  });

  it("removes the parameter entirely for an empty or missing selection", () => {
    const params = new URLSearchParams("selected=1");

    writeSelected(params, []);
    expect(params.has("selected")).toBe(false);

    params.append("selected", "1");
    writeSelected(params, undefined as never);
    expect(params.has("selected")).toBe(false);
  });
});

describe("readPositiveInt", () => {
  it("reads a positive integer", () => {
    expect(readPositiveInt(new URLSearchParams("page=7"), "page", 1)).toBe(7);
  });

  it("falls back for anything that is not one", () => {
    for (const query of ["", "page=abc", "page=0", "page=-3", "page=1.5", "page=", "page=Infinity"]) {
      expect(readPositiveInt(new URLSearchParams(query), "page", 1)).toBe(1);
    }
  });
});

describe("readColumnFilter", () => {
  const columns: DataGridColumn<Row>[] = [
    { key: "status", label: "Status" },
    { key: "bank", label: "Bank", multiple: true },
    { key: "absent", label: "Absent" },
  ];

  it("reads only declared columns and ignores unrelated parameters", () => {
    const params = new URLSearchParams("status=active&bank=a&bank=b&page=2&stray=1");

    expect(readColumnFilter(params, columns)).toEqual({ status: "active", bank: ["a", "b"] });
  });

  it("returns an array for a multiple column and a string otherwise", () => {
    const params = new URLSearchParams("status=a&status=b&bank=x");
    const result = readColumnFilter(params, columns);

    expect(result.status).toBe("a");
    expect(result.bank).toEqual(["x"]);
  });
});

describe("writeState", () => {
  it("writes the whole state and drops what the state does not mention", () => {
    const params = new URLSearchParams("page=3&sort=name&order=asc&status=stale&selected=9");

    writeState(params, state({ page: 2, limit: 25, filter: { bank: ["a", "b"] } }));

    expect(params.toString()).toBe("page=2&limit=25&bank=a&bank=b");
  });

  it("produces the same query string when applied to its own output", () => {
    const target = state({ page: 2, sort: "name", order: "desc", filter: { status: "new" }, selected: ["3"] });
    const once = new URLSearchParams("status=old&page=7");

    writeState(once, target);

    const twice = new URLSearchParams(once);

    writeState(twice, target);

    // The URL is compared against the state by serializing the state, so a
    // second pass that reordered the parameters would read as a change forever.
    expect(twice.toString()).toBe(once.toString());
  });
});

describe("isSelectedEqual", () => {
  it("compares by value and treats a reordering as a change", () => {
    expect(isSelectedEqual(["a", "b"], ["a", "b"])).toBe(true);
    expect(isSelectedEqual(["a", "b"], ["b", "a"])).toBe(false);
    expect(isSelectedEqual(["a"], ["a", "b"])).toBe(false);
    expect(isSelectedEqual([], [])).toBe(true);
  });

  it("accepts the same array and a missing one", () => {
    const selected = ["a", "b"];

    expect(isSelectedEqual(selected, selected)).toBe(true);
    expect(isSelectedEqual(selected, undefined as never)).toBe(false);
  });
});

describe("isFilterEqual", () => {
  it("compares by value, one level deep, regardless of key order", () => {
    expect(isFilterEqual({ a: "1", b: "2" }, { b: "2", a: "1" })).toBe(true);
    expect(isFilterEqual({ a: ["x", "y"] }, { a: ["x", "y"] })).toBe(true);
    expect(isFilterEqual({ a: ["x"] }, { a: ["y"] })).toBe(false);
    expect(isFilterEqual({ a: "1" }, { a: 1 })).toBe(false);
    expect(isFilterEqual({ a: "1" }, { b: "1" })).toBe(false);
    expect(isFilterEqual({ a: ["x"] }, { a: "x" })).toBe(false);
    expect(isFilterEqual({ a: ["x"] }, { a: ["x", "y"] })).toBe(false);
  });

  it("accepts the same object and a missing one", () => {
    const filter = { a: "1" };

    expect(isFilterEqual(filter, filter)).toBe(true);
    expect(isFilterEqual(filter, undefined as never)).toBe(false);
  });

  it("separates an invalidated entry from an absent one", () => {
    // A deriveState invalidates a dependent filter by assigning `undefined`,
    // and that change has to be visible.
    expect(isFilterEqual({ a: undefined }, {})).toBe(false);
  });
});

describe("isStateEqual", () => {
  it("reports a state as equal to a copy of itself", () => {
    const source = state({ page: 2, sort: "name", order: "asc", filter: { a: ["x"] }, selected: ["1"] });

    expect(isStateEqual(source, cloneDataGridState(source))).toBe(true);
  });

  it.each([
    ["page", { page: 2 }],
    ["limit", { limit: 25 }],
    ["sort", { sort: "name" }],
    ["order", { order: "asc" as const }],
    ["filter", { filter: { a: "1" } }],
    ["selected", { selected: ["1"] }],
  ])("reports a difference in %s", (_field, overrides) => {
    expect(isStateEqual(state(), state(overrides))).toBe(false);
  });
});

describe("applyStateDiff", () => {
  it("touches nothing when the two states agree", () => {
    const params = new URLSearchParams("bank=x&tab=details");

    applyStateDiff(params, state({ filter: { bank: "x" } }), state({ filter: { bank: "x" } }));

    expect(params.toString()).toBe("bank=x&tab=details");
  });

  it("removes a filter one state dropped and keeps everything else in place", () => {
    const params = new URLSearchParams("tab=details&bank=ghost&page=4");

    applyStateDiff(params, state({ page: 4, filter: { bank: "ghost" } }), state({ page: 4, filter: {} }));

    expect(params.toString()).toBe("tab=details&page=4");
  });

  it("writes a filter one state added", () => {
    const params = new URLSearchParams();

    applyStateDiff(params, state(), state({ filter: { scope: "mine", bank: ["a", "b"] } }));

    expect(params.toString()).toBe("scope=mine&bank=a&bank=b");
  });

  it("tolerates a state whose filter is missing on either side", () => {
    const dropped = new URLSearchParams("bank=x");

    applyStateDiff(dropped, state({ filter: { bank: "x" } }), state({ filter: undefined as never }));
    expect(dropped.toString()).toBe("");

    const added = new URLSearchParams();

    applyStateDiff(added, state({ filter: undefined as never }), state({ filter: { bank: "x" } }));
    expect(added.toString()).toBe("bank=x");
  });

  it("writes the pagination, the sorting and the selection that moved", () => {
    const params = new URLSearchParams();

    applyStateDiff(params, state(), state({ page: 2, limit: 25, sort: "name", order: "asc", selected: ["3"] }));

    expect(params.toString()).toBe("page=2&limit=25&sort=name&order=asc&selected=3");
  });

  it("clears the sorting and the selection that went away", () => {
    const params = new URLSearchParams("sort=name&order=asc&selected=3");
    const sorted = state({ sort: "name", order: "asc", selected: ["3"] });

    applyStateDiff(params, sorted, state());

    expect(params.toString()).toBe("");
  });
});

describe("isSameQuery", () => {
  it("reads the same parameters in a different order as the same query", () => {
    expect(isSameQuery(new URLSearchParams("a=1&b=2"), new URLSearchParams("b=2&a=1"))).toBe(true);
  });

  it("keeps the order of the values under one key significant", () => {
    expect(isSameQuery(new URLSearchParams("a=1&a=2"), new URLSearchParams("a=2&a=1"))).toBe(false);
  });

  it("separates queries that differ in content", () => {
    expect(isSameQuery(new URLSearchParams("a=1"), new URLSearchParams("a=1&b=2"))).toBe(false);
    expect(isSameQuery(new URLSearchParams("a=1"), new URLSearchParams("a=2"))).toBe(false);
  });
});
