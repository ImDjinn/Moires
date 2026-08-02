import { describe, it, expect, beforeEach } from "vitest";
import { SORT_KEY, loadSort } from "./GanttBoard";

const write = (v: unknown) => localStorage.setItem(SORT_KEY, JSON.stringify(v));

describe("loadSort — restauration de l'axe et du sens du tri", () => {
  beforeEach(() => localStorage.clear());

  it("sans rien de stocké, ne surcharge pas l'état initial", () => {
    expect(loadSort()).toBeUndefined();
  });

  it("restaure les valeurs valides", () => {
    write({ sort: "loadDesc", epicSort: "Custom.Field", epicSortDir: "desc" });
    expect(loadSort()).toEqual({ sort: "loadDesc", epicSort: "Custom.Field", epicSortDir: "desc" });
  });

  it("ignore les valeurs inconnues ou corrompues", () => {
    write({ sort: "n_importe_quoi", epicSortDir: "haut" });
    expect(loadSort()).toEqual({});

    localStorage.setItem(SORT_KEY, "{pas du json");
    expect(loadSort()).toBeUndefined();
  });
});
