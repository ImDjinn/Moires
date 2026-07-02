import { describe, it, expect } from "vitest";
import type { SessionSnapshot, Ticket } from "@moires/shared";
import { buildDataset } from "./adapter";

function ticket(p: Partial<Ticket>): Ticket {
  return {
    id: "0", title: "T", workItemType: "User Story", parentId: null, state: "New", tags: [],
    assigneeId: "m1", areaPath: "Proj\\A", iterationId: "Proj\\S1", epicId: null, epicTitle: null,
    startDate: "2026-06-15", endDate: "2026-06-26", targetDate: null, estimateHours: 0, storyPoints: 0, adoRev: 1,
    syncStatus: "synced", ...p,
  };
}

const snapshot: SessionSnapshot = {
  sessionId: "s1",
  participants: [],
  teamMembers: [{ id: "m1", displayName: "Alice Beaumont", capacityHoursPerDay: 8 }],
  iterations: [
    { id: "1", name: "Sprint 1", path: "Proj\\S1", startDate: "2026-06-15", finishDate: "2026-06-26" },
    { id: "2", name: "Sprint 2", path: "Proj\\S2", startDate: "2026-06-29", finishDate: "2026-07-10" },
  ],
  capacities: [],
  tickets: [
    ticket({ id: "E1", workItemType: "Epic", title: "Epic One" }),
    ticket({ id: "100", workItemType: "Feature", title: "Feature A", parentId: "E1", epicId: "E1", epicTitle: "Epic One", storyPoints: 8, state: "Active" }),
    ticket({ id: "101", workItemType: "User Story", title: "US 1", parentId: "100", epicId: "E1", epicTitle: "Epic One", storyPoints: 5 }),
    ticket({ id: "102", workItemType: "Task", title: "Task 1", parentId: "101", assigneeId: "ghost@x", iterationId: "Proj\\S2", estimateHours: 2 }),
    ticket({ id: "103", workItemType: "User Story", title: "Backlog US", iterationId: "Proj\\NOPE" }),
  ],
};

describe("buildDataset", () => {
  const ds = buildDataset(snapshot);

  it("ajoute le Backlog après les itérations datées", () => {
    expect(ds.iters).toHaveLength(3);
    expect(ds.iters[2].label).toBe("Backlog");
    expect(ds.niter).toBe(2);
  });

  it("inclut l'Epic comme item de niveau epic (racine du Release tree)", () => {
    expect(ds.items.map((i) => i.id).sort()).toEqual(["100", "101", "102", "103", "E1"]);
    const byId = Object.fromEntries(ds.items.map((i) => [i.id, i]));
    expect(byId["E1"].level).toBe("epic");
  });

  it("mappe workItemType vers level", () => {
    const byId = Object.fromEntries(ds.items.map((i) => [i.id, i]));
    expect(byId["E1"].level).toBe("epic");
    expect(byId["100"].level).toBe("feature");
    expect(byId["101"].level).toBe("story");
    expect(byId["102"].level).toBe("task");
  });

  it("résout l'index d'itération depuis le path, backlog si inconnu", () => {
    const byId = Object.fromEntries(ds.items.map((i) => [i.id, i]));
    expect(byId["101"].iter).toBe(0);
    expect(byId["102"].iter).toBe(1);
    expect(byId["103"].iter).toBe(2); // path inconnu → backlog
  });

  it("crée une pseudo-personne pour les non-assignés / hors équipe", () => {
    expect(ds.people.map((p) => p.id)).toContain("m1");
    const unassigned = ds.people.find((p) => p.name === "Non assigné");
    expect(unassigned).toBeTruthy();
    const task = ds.items.find((i) => i.id === "102")!;
    expect(task.person).toBe(unassigned!.id);
  });

  it("construit la map des epics et storyToFeature", () => {
    expect(ds.epics["E1"]?.label).toBe("Epic One");
    expect(ds.storyToFeature["101"]).toBe("100");
    expect(ds.titleOf["100"]).toBe("Feature A");
  });
});

describe("buildDataset — intervalle Feature via Start/Target Date (#1)", () => {
  const ds = buildDataset({
    sessionId: "s", participants: [], teamMembers: [], capacities: [],
    iterations: [
      { id: "1", name: "S1", path: "P\\S1", startDate: "2026-06-15", finishDate: "2026-06-26" },
      { id: "2", name: "S2", path: "P\\S2", startDate: "2026-06-29", finishDate: "2026-07-10" },
    ],
    tickets: [
      ticket({ id: "200", workItemType: "Feature", startDate: "2026-06-18", targetDate: "2026-07-02", iterationId: "P\\S1" }),
      ticket({ id: "201", workItemType: "Feature", startDate: "2026-06-18", targetDate: null, iterationId: "P\\S1" }),
    ],
  });

  it("Feature avec Target Date => hasDateRange + bornes = dates", () => {
    const f = ds.items.find((i) => i.id === "200")!;
    expect(f.hasDateRange).toBe(true);
    expect(f.startISO).toBe("2026-06-18");
    expect(f.endISO).toBe("2026-07-02");
  });

  it("Feature sans Target Date => pas de hasDateRange (retombe sur les enfants)", () => {
    const f = ds.items.find((i) => i.id === "201")!;
    expect(f.hasDateRange).toBe(false);
  });
});

describe("buildDataset — états Daily réels ordonnés (#3)", () => {
  it("utilise snapshot.states dans l'ordre + couleurs/catégories", () => {
    const ds = buildDataset({
      sessionId: "s", participants: [], teamMembers: [], capacities: [], iterations: [], tickets: [],
      states: [
        { name: "To Do", category: "Proposed", color: "#aaaaaa" },
        { name: "Doing", category: "InProgress", color: "#0072B2" },
        { name: "Done", category: "Completed", color: "#009E73" },
      ],
    });
    expect(ds.dailyStates).toEqual(["To Do", "Doing", "Done"]);
    expect(ds.stateColors["Doing"]).toBe("#0072B2");
    expect(ds.stateCat["Done"]).toBe("Completed");
  });

  it("fallback aux états par défaut si ADO n'en fournit pas", () => {
    const ds = buildDataset({ sessionId: "s", participants: [], teamMembers: [], capacities: [], iterations: [], tickets: [] });
    expect(ds.dailyStates).toEqual(["New", "Active", "Resolved", "Closed"]);
  });

  it("regroupe les états par niveau selon le type de work item, dans l'ordre ADO", () => {
    const ds = buildDataset({
      sessionId: "s", participants: [], teamMembers: [], capacities: [], iterations: [], tickets: [],
      states: [
        { name: "New", category: "Proposed", color: "#aaa", type: "User Story" },
        { name: "Blocked", category: "InProgress", color: "#f00", type: "User Story" },
        { name: "Active", category: "InProgress", color: "#00f", type: "User Story" },
        { name: "Closed", category: "Completed", color: "#0f0", type: "User Story" },
        { name: "New", category: "Proposed", color: "#aaa", type: "Epic" },
        { name: "Done", category: "Completed", color: "#0f0", type: "Epic" },
      ],
    });
    expect(ds.dailyStatesByLevel.story).toEqual(["New", "Blocked", "Active", "Closed"]);
    expect(ds.dailyStatesByLevel.epic).toEqual(["New", "Done"]);
    expect(ds.dailyStatesByLevel.feature).toEqual([]);
  });
});
