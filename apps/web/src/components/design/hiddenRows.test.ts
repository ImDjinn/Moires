import { describe, it, expect } from "vitest";
import * as M from "./ganttModel";

// Charge totale de la bande Release, sommée sur toutes les colonnes.
const bandTotal = (s: M.State) => M.relLoadBand(s, M.relCols(), "light").reduce((sum, b) => sum + b.total, 0);

describe("hiddenRows — masquer une ligne l'exclut de la charge", () => {
  it("masquer un epic retire la charge de ses US ; le réafficher la restaure", () => {
    const base = { ...M.createInitialState(), board: "release" as const };
    const full = bandTotal(base);
    expect(full).toBeGreaterThan(0);

    // Une ligne epic du board release a pour clé "epic:<id>".
    const epic = base.items.find((i) => i.level === "epic")!;
    const key = "epic:" + epic.id;

    const hiddenOne = { ...base, hiddenRows: { [key]: true } };
    expect(bandTotal(hiddenOne)).toBeLessThan(full);

    // Réafficher (flag repassé à false) revient au total complet.
    expect(bandTotal({ ...base, hiddenRows: { [key]: false } })).toBe(full);
  });

  it("masquer toutes les lignes epic met la charge à zéro", () => {
    const base = { ...M.createInitialState(), board: "release" as const };
    const hiddenRows: Record<string, boolean> = {};
    base.items.filter((i) => i.level === "epic").forEach((e) => (hiddenRows[`epic:${e.id}`] = true));
    // Features orphelines (sans epic) → clé "epic:__none__".
    hiddenRows["epic:__none__"] = true;
    expect(bandTotal({ ...base, hiddenRows })).toBe(0);
  });
});
