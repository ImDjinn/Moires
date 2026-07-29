import { describe, it, expect } from "vitest";
import type { SessionSnapshot, Ticket } from "@moires/shared";
import { buildDataset } from "./adapter";
import * as M from "./ganttModel";

function t(p: Partial<Ticket>): Ticket {
  return {
    id: "0", title: "T", workItemType: "User Story", parentId: null, state: "Active", tags: [],
    assigneeId: "m1", areaPath: "P\\A", iterationId: "P\\1", epicId: null, epicTitle: null,
    startDate: "", endDate: "", targetDate: null, estimateHours: 0, storyPoints: 0,
    adoRev: 1, syncStatus: "synced", ...p,
  };
}

// Itérations en 2020 (passées) => itération courante = index 0.
const snapshot: SessionSnapshot = {
  sessionId: "s", participants: [], teamMembers: [{ id: "m1", displayName: "A", capacityHoursPerDay: 8 }], capacities: [],
  iterations: [
    { id: "1", name: "S1", path: "P\\1", startDate: "2020-01-01", finishDate: "2020-01-14" },
    { id: "2", name: "S2", path: "P\\2", startDate: "2020-02-01", finishDate: "2020-02-14" },
    { id: "3", name: "S3", path: "P\\3", startDate: "2020-03-01", finishDate: "2020-03-14" },
  ],
  tickets: [
    t({ id: "E1", title: "Epic 1", workItemType: "Epic" }),
    t({ id: "E2", title: "Epic 2", workItemType: "Epic" }),
    t({ id: "F1", title: "Feature 1", workItemType: "Feature", parentId: "E1", epicId: "E1" }),
    t({ id: "S1", title: "US sous feature", parentId: "F1", epicId: "E1", iterationId: "P\\1", storyPoints: 5 }),
    // Feature parente absente du lot (hors itérations synchronisées) : l'US doit
    // quand même apparaître sous son Epic et compter une seule fois.
    t({ id: "S2", title: "US feature absente", parentId: "F_ABSENTE", epicId: "E1", iterationId: "P\\2", storyPoints: 8 }),
    // Ni feature ni epic : nœud « (Sans epic) ».
    t({ id: "S3", title: "US orpheline", parentId: null, iterationId: "P\\3", storyPoints: 3 }),
    // Epic 2 : uniquement en S3 => statut « à venir » (itération courante = 0).
    t({ id: "S4", title: "US epic 2", parentId: null, epicId: "E2", iterationId: "P\\3", storyPoints: 4 }),
  ],
};

function stateWith(over: Partial<M.State> = {}): M.State {
  const ds = buildDataset(snapshot);
  M.applyDataset(ds);
  return { ...M.createInitialState(ds.items), board: "release", ...over };
}

/** Charge par colonne telle qu'affichée sur les barres d'epic du board. */
function epicBarCharge(s: M.State): Record<number, number> {
  const per: Record<number, number> = {};
  M.computeLayout(s, 200).rows.forEach((r) => {
    if (r.kind !== "epic" || !r.range) return;
    const ch = M.parentCharge(s, r.us || []);
    for (let i = r.range[0]; i <= r.range[1]; i++) per[i] = (per[i] || 0) + (ch.per[i] || 0);
  });
  return per;
}

describe("Release planning — charge des colonnes = somme des barres d'epic", () => {
  it("compte les US dont la Feature parente est absente du lot", () => {
    const s = stateWith();
    const bars = epicBarCharge(s);
    const band = M.relLoadBand(s, M.relCols(), "light");
    band.forEach((b) => expect(b.total, `colonne ${b.real}`).toBe(bars[b.real] || 0));
    expect(band.reduce((x, b) => x + b.total, 0)).toBe(5 + 8 + 3 + 4);
    // Chaque US est rattachée à exactement une ligne de l'arbre.
    expect(M.releaseStories(s).map((i) => i.id).sort()).toEqual(["S1", "S2", "S3", "S4"]);
  });

  it("« Filtre epics » retire aussi la charge des epics masqués", () => {
    const all = M.relLoadBand(stateWith(), M.relCols(), "light").reduce((x, b) => x + b.total, 0);
    // activeOnly ne garde que les epics en cours : E2 (4) et « (Sans epic) » (3)
    // n'ont d'US qu'en S3, donc « à venir » => sortis de l'arbre et du total.
    const active = stateWith({ epicFilter: "activeOnly" });
    const kept = M.relLoadBand(active, M.relCols(), "light").reduce((x, b) => x + b.total, 0);
    expect(all - kept).toBe(4 + 3);
    expect(M.releaseMetrics({ ...active, metricsFrom: 0, metricsTo: M.NITER - 1 }).effort).toBe(kept);
    expect(epicBarCharge(active)).toEqual({ 0: 5, 1: 8 });
  });

  it("masquer une ligne epic exclut ses US rattachées directement", () => {
    const s = stateWith({ hiddenRows: { "epic:E1": true } });
    expect(M.relLoadBand(s, M.relCols(), "light").reduce((x, b) => x + b.total, 0)).toBe(3 + 4);
  });
});
