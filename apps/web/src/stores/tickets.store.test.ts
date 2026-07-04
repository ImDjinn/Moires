import { describe, it, expect, beforeEach } from "vitest";
import type { Ticket, Operation } from "@moires/shared";
import { useTicketsStore } from "./tickets.store";

const base: Ticket = {
  id: "t1",
  title: "T",
  assigneeId: "m1",
  areaPath: "",
  iterationId: "it1",
  epicId: null,
  epicTitle: null,
  workItemType: "User Story",
  parentId: null,
  state: "New",
  tags: [],
  targetDate: null,
  startDate: "2026-06-10",
  endDate: "2026-06-11",
  estimateHours: 8,
  storyPoints: 3,
  adoRev: 1,
  syncStatus: "synced",
};

beforeEach(() => {
  useTicketsStore.setState({ tickets: [] });
});

describe("tickets.store", () => {
  it("setTickets remplace la liste", () => {
    useTicketsStore.getState().setTickets([base]);
    expect(useTicketsStore.getState().tickets).toEqual([base]);
  });

  it("applyOperation met à jour le champ ciblé et passe en pending", () => {
    useTicketsStore.getState().setTickets([base]);
    const op: Operation = {
      ticketId: "t1",
      field: "assigneeId",
      value: "m2",
      userId: "u1",
      clientTimestamp: 1,
    };
    useTicketsStore.getState().applyOperation(op);
    const t = useTicketsStore.getState().tickets[0];
    expect(t.assigneeId).toBe("m2");
    expect(t.syncStatus).toBe("pending");
  });

  it("applyOperation sur 'custom:<ref>' écrit customFields (null = effacer)", () => {
    useTicketsStore.getState().setTickets([{ ...base, customFields: { "Custom.Note": "n" } }]);
    useTicketsStore.getState().applyOperation({
      ticketId: "t1", field: "custom:Custom.Charge", value: 13, userId: "u1", clientTimestamp: 1,
    });
    let t = useTicketsStore.getState().tickets[0];
    expect(t.customFields).toEqual({ "Custom.Note": "n", "Custom.Charge": 13 });
    expect(t.syncStatus).toBe("pending");
    useTicketsStore.getState().applyOperation({
      ticketId: "t1", field: "custom:Custom.Charge", value: null, userId: "u1", clientTimestamp: 2,
    });
    t = useTicketsStore.getState().tickets[0];
    expect(t.customFields).toEqual({ "Custom.Note": "n" });
  });

  it("applyOperation ne touche pas les autres tickets", () => {
    const other: Ticket = { ...base, id: "t2" };
    useTicketsStore.getState().setTickets([base, other]);
    useTicketsStore.getState().applyOperation({
      ticketId: "t1",
      field: "endDate",
      value: "2026-06-20",
      userId: "u1",
      clientTimestamp: 1,
    });
    expect(useTicketsStore.getState().tickets[1]).toEqual(other);
  });

  it("updateTicket remplace le ticket réconcilié", () => {
    useTicketsStore.getState().setTickets([base]);
    const synced: Ticket = { ...base, assigneeId: "m2", syncStatus: "synced", adoRev: 2 };
    useTicketsStore.getState().updateTicket(synced);
    expect(useTicketsStore.getState().tickets[0]).toEqual(synced);
  });

  it("updateSyncStatus met à jour le statut et la révision ADO", () => {
    useTicketsStore.getState().setTickets([base]);
    useTicketsStore.getState().updateSyncStatus("t1", "synced", 5);
    const t = useTicketsStore.getState().tickets[0];
    expect(t.syncStatus).toBe("synced");
    expect(t.adoRev).toBe(5);
  });

  it("updateSyncStatus met à jour le statut sans changer adoRev si absent", () => {
    useTicketsStore.getState().setTickets([base]);
    useTicketsStore.getState().updateSyncStatus("t1", "error");
    const t = useTicketsStore.getState().tickets[0];
    expect(t.syncStatus).toBe("error");
    expect(t.adoRev).toBe(base.adoRev);
  });
});
