import { describe, it, expect } from "vitest";
import type { Ticket, TeamMember } from "@moirai/shared";
import {
  buildRows,
  cellTickets,
  epicSpan,
  UNASSIGNED_ROW,
  NO_EPIC_ROW,
} from "./grouping";

function ticket(p: Partial<Ticket>): Ticket {
  return {
    id: "t",
    title: "T",
    assigneeId: null,
    areaPath: "",
    iterationId: "S1",
    epicId: null,
    epicTitle: null,
    workItemType: "User Story",
    parentId: null,
    state: "New",
    tags: [],
    targetDate: null,
    startDate: "2026-06-10",
    endDate: "2026-06-11",
    estimateHours: 4,
    storyPoints: 2,
    adoRev: 1,
    syncStatus: "synced",
    ...p,
  };
}

const members: TeamMember[] = [
  { id: "m1", displayName: "Alice", capacityHoursPerDay: 8 },
  { id: "m2", displayName: "Bob", capacityHoursPerDay: 6 },
];

describe("buildRows", () => {
  it("mode user : 'Non assigné' puis un membre par ligne", () => {
    expect(buildRows([], members, "user")).toEqual([
      { id: UNASSIGNED_ROW, label: "Non assigné" },
      { id: "m1", label: "Alice" },
      { id: "m2", label: "Bob" },
    ]);
  });

  it("mode epic : un epic par ligne dans l'ordre d'apparition + 'Sans Epic'", () => {
    const tickets = [
      ticket({ id: "a", epicId: "e1", epicTitle: "Epic 1" }),
      ticket({ id: "b", epicId: "e2", epicTitle: "Epic 2" }),
      ticket({ id: "c", epicId: "e1", epicTitle: "Epic 1" }),
      ticket({ id: "d", epicId: null }),
    ];
    expect(buildRows(tickets, members, "epic")).toEqual([
      { id: "e1", label: "Epic 1" },
      { id: "e2", label: "Epic 2" },
      { id: NO_EPIC_ROW, label: "Sans Epic" },
    ]);
  });

  it("mode epic : pas de ligne 'Sans Epic' si tous ont un epic", () => {
    const tickets = [ticket({ epicId: "e1", epicTitle: "E1" })];
    expect(buildRows(tickets, members, "epic")).toEqual([{ id: "e1", label: "E1" }]);
  });
});

describe("cellTickets", () => {
  const valid = new Set(["m1", "m2"]);
  const tickets = [
    ticket({ id: "a", assigneeId: "m1", iterationId: "S1" }),
    ticket({ id: "b", assigneeId: "m1", iterationId: "S2" }),
    ticket({ id: "c", assigneeId: "ghost", iterationId: "S1" }),
  ];

  it("filtre par membre et par colonne de sprint", () => {
    expect(cellTickets(tickets, "m1", "S1", "user", valid).map((t) => t.id)).toEqual(["a"]);
  });

  it("range les assignés inconnus dans 'Non assigné'", () => {
    expect(cellTickets(tickets, UNASSIGNED_ROW, "S1", "user", valid).map((t) => t.id)).toEqual(["c"]);
  });
});

describe("epicSpan", () => {
  const iterations = [{ path: "S1" }, { path: "S2" }, { path: "S3" }];

  it("renvoie l'étendue de colonnes couverte par l'epic", () => {
    const tickets = [
      ticket({ epicId: "e1", iterationId: "S1" }),
      ticket({ epicId: "e1", iterationId: "S3" }),
      ticket({ epicId: "e2", iterationId: "S2" }),
    ];
    expect(epicSpan(tickets, "e1", iterations)).toEqual({ start: 0, end: 2 });
  });

  it("renvoie null si aucun ticket de l'epic n'est placé", () => {
    expect(epicSpan([], "e1", iterations)).toBeNull();
  });
});
