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

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

// S1 contient aujourd'hui, S2/S3 à venir => l'itération courante est l'index 0.
const snapshot: SessionSnapshot = {
  sessionId: "s", participants: [], teamMembers: [{ id: "m1", displayName: "A", capacityHoursPerDay: 8 }], capacities: [],
  iterations: [
    { id: "1", name: "S1", path: "P\\1", startDate: day(-5), finishDate: day(5) },
    { id: "2", name: "S2", path: "P\\2", startDate: day(10), finishDate: day(20) },
    { id: "3", name: "S3", path: "P\\3", startDate: day(25), finishDate: day(35) },
  ],
  tickets: [
    t({ id: "EA", title: "En cours 2", startDate: day(-3), targetDate: day(15), priority: 2, customFields: { "Custom.Valeur": 8 } }), // [0,1] en cours
    t({ id: "ED", title: "En cours 1", startDate: day(-3), targetDate: day(2), priority: 1, customFields: { "Custom.Valeur": 3 } }),  // [0,0] en cours
    t({ id: "EB", title: "À venir", startDate: day(12), targetDate: day(30), priority: 1 }),                                          // [1,2] à venir
  ],
};

function stateWith(over: Partial<M.State>): M.State {
  const ds = buildDataset(snapshot);
  M.applyDataset(ds);
  return { ...M.createInitialState(ds.items), board: "release", ...over };
}

describe("buildTree — groupement par Epic + statut/priorité + filtre", () => {
  it("l'itération courante est celle qui contient aujourd'hui", () => {
    const ds = buildDataset(snapshot);
    expect(ds.current).toBe(0);
  });

  it("ordre : en cours d'abord (par priorité), puis à venir, puis terminé", () => {
    const tree = M.buildTree(stateWith({ epicSort: "priority" }));
    // ED (en cours, prio 1) < EA (en cours, prio 2) < EB (à venir)
    expect(tree.map((n) => n.epic!.id)).toEqual(["ED", "EA", "EB"]);
    expect(tree.map((n) => n.bucket)).toEqual([0, 0, 2]); // cf. M.statusBucket
  });

  it("tri sur un champ custom de l'Epic : numérique décroissant, absents en dernier", () => {
    const tree = M.buildTree(stateWith({ epicSort: "Custom.Valeur" }));
    // EA (8) < ED (3) dans le bucket « en cours » ; EB (sans valeur) reste à venir.
    expect(tree.map((n) => n.epic!.id)).toEqual(["EA", "ED", "EB"]);
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

describe("effortOf — champ de charge configurable (dont champ ADO custom)", () => {
  const item: M.Item = {
    id: "X", ado: "X", level: "story", type: "story", title: "t", points: 5, effortDays: 2,
    person: "m1", iter: 0, span: 1, state: "New", progress: 0, parent: null, tags: [],
    startISO: "", endISO: "", area: "", custom: { "Custom.Charge": 13, "Custom.Note": "n/a" },
  };

  it("champs mappés : Story Points ou estimation en jours", () => {
    M.setLoadField("points");
    expect(M.effortOf(item)).toBe(5);
    M.setLoadField("effortDays");
    expect(M.effortOf(item)).toBe(2);
    M.setLoadField("points");
  });

  it("champ custom numérique : lit Item.custom[referenceName]", () => {
    M.setLoadField("Custom.Charge");
    expect(M.effortOf(item)).toBe(13);
    M.setLoadField("points");
  });

  it("champ custom absent ou non numérique : 0", () => {
    M.setLoadField("Custom.Absent");
    expect(M.effortOf(item)).toBe(0);
    M.setLoadField("Custom.Note");
    expect(M.effortOf(item)).toBe(0);
    M.setLoadField("points");
  });
});
