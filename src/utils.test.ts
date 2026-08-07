// @vitest-environment node

import type { DataGridColumn, DataGridRow, DataGridState } from "@sovgut/datagrid";
import { describe, expect, it } from "vitest";

import {
  calculateDerivedState,
  cloneDataGridState,
  DATAGRID_RESERVED_KEYS,
  deleteFilterKeys,
  readColumnFilter,
  readPositiveInt,
  writeFilter,
  writeSelected,
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
