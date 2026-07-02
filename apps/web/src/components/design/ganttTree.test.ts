import { describe, it, expect } from "vitest";
import type { SessionSnapshot, Ticket } from "@moires/shared";
import { buildDataset } from "./adapter";
import * as M from "./ganttModel";

function t(p: Partial<Ticket>): Ticket {
  return {
    id: "0", title: "T", workItemType: "Epic", parentId: null, state: "Active", tags: [],
    assigneeId: "m1", areaPath: "P\\A", iterationId: "P\\1", epicId: null, epicTitle: null,
    startDate: "2020-01-01", endDate: "2020-01-14", targetDate: null, estimateHours: 0, storyPoints: 0,
    adoRev: 1, syncStatus: "synced", ...p,
  };
}

// Itérations en 2020 (toutes passées) => l'itération courante est l'index 0.
const snapshot: SessionSnapshot = {
  sessionId: "s", participants: [], teamMembers: [{ id: "m1", displayName: "A", capacityHoursPerDay: 8 }], capacities: [],
  iterations: [
    { id: "1", name: "S1", path: "P\\1", startDate: "2020-01-01", finishDate: "2020-01-14" },
    { id: "2", name: "S2", path: "P\\2", startDate: "2020-02-01", finishDate: "2020-02-14" },
    { id: "3", name: "S3", path: "P\\3", startDate: "2020-03-01", finishDate: "2020-03-14" },
  ],
  tickets: [
    t({ id: "EA", title: "En cours 2", startDate: "2020-01-05", targetDate: "2020-02-10", priority: 2 }), // [0,1] en cours
    t({ id: "ED", title: "En cours 1", startDate: "2020-01-05", targetDate: "2020-01-10", priority: 1 }), // [0,0] en cours
    t({ id: "EB", title: "À venir", startDate: "2020-02-05", targetDate: "2020-03-10", priority: 1 }),     // [1,2] à venir
  ],
};

function stateWith(over: Partial<M.State>): M.State {
  const ds = buildDataset(snapshot);
  M.applyDataset(ds);
  return { ...M.createInitialState(ds.items), board: "release", ...over };
}

describe("buildTree — groupement par Epic + statut/priorité + filtre", () => {
  it("l'itération courante est l'index 0 (dates passées)", () => {
    const ds = buildDataset(snapshot);
    expect(ds.current).toBe(0);
  });

  it("ordre : en cours d'abord (par priorité), puis à venir, puis terminé", () => {
    const tree = M.buildTree(stateWith({ epicSort: "priority" }));
    // ED (en cours, prio 1) < EA (en cours, prio 2) < EB (à venir)
    expect(tree.map((n) => n.epic!.id)).toEqual(["ED", "EA", "EB"]);
    expect(tree.map((n) => n.bucket)).toEqual([0, 0, 1]);
  });

  it("filtre 'activeOnly' ne garde que les epics en cours", () => {
    const tree = M.buildTree(stateWith({ epicFilter: "activeOnly" }));
    expect(tree.map((n) => n.epic!.id).sort()).toEqual(["EA", "ED"]);
  });

  it("l'intervalle de l'Epic vient de Start/Target Date", () => {
    const tree = M.buildTree(stateWith({}));
    const ea = tree.find((n) => n.epic!.id === "EA")!;
    expect(ea.range).toEqual([0, 1]); // 05 janv (S1) → 10 févr (S2)
  });
});
