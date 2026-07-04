import { describe, it, expect } from "vitest";
import type { Ticket, Capacity } from "@moirai/shared";
import { loadOf, capacityOf } from "./load";

function ticket(p: Partial<Ticket>): Ticket {
  return {
    id: "t",
    title: "T",
    assigneeId: "m1",
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
    estimateHours: 0,
    storyPoints: 0,
    adoRev: 1,
    syncStatus: "synced",
    ...p,
  };
}

describe("loadOf", () => {
  it("somme les Story Points d'un membre sur une itération", () => {
    const tickets = [
      ticket({ id: "a", assigneeId: "m1", iterationId: "S1", storyPoints: 3 }),
      ticket({ id: "b", assigneeId: "m1", iterationId: "S1", storyPoints: 5 }),
      ticket({ id: "c", assigneeId: "m1", iterationId: "S2", storyPoints: 8 }), // autre sprint
      ticket({ id: "d", assigneeId: "m2", iterationId: "S1", storyPoints: 2 }), // autre membre
    ];
    expect(loadOf(tickets, "m1", "S1")).toBe(8);
  });
});

describe("capacityOf", () => {
  const caps: Capacity[] = [{ memberId: "m1", iterationPath: "S1", storyPoints: 13 }];
  it("renvoie la capacité saisie", () => {
    expect(capacityOf(caps, "m1", "S1")).toBe(13);
  });
  it("renvoie 0 si absente", () => {
    expect(capacityOf(caps, "m1", "S2")).toBe(0);
  });
});
