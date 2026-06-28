import { describe, it, expect, beforeEach } from "vitest";
import type { Ticket, Operation } from "@moires/shared";
import { useTicketsStore } from "./tickets.store";

const base: Ticket = {
  id: "t1",
  title: "T",
  assigneeId: "m1",
  areaPath: "",
  iterationId: "it1",
  startDate: "2026-06-10",
  endDate: "2026-06-11",
  estimateHours: 8,
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
});
