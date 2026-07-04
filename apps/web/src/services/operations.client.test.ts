import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Ticket } from "@moirai/shared";
import { useTicketsStore } from "../stores/tickets.store";

const handlers: Record<string, (...a: any[]) => void> = {};
const fakeSocket = {
  on: vi.fn((event: string, h: (...a: any[]) => void) => {
    handlers[event] = h;
  }),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connected: false,
};

vi.mock("socket.io-client", () => ({ io: vi.fn(() => fakeSocket) }));

import { io } from "socket.io-client";
import { connectSocket, submitOperation, disconnectSocket, getSocket } from "./operations.client";

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
  vi.clearAllMocks();
  for (const k of Object.keys(handlers)) delete handlers[k];
  useTicketsStore.setState({ tickets: [base] });
});

describe("operations.client", () => {
  it("connectSocket ouvre la socket avec la query de session", () => {
    connectSocket("s1", "u1", "Alice");
    expect(io).toHaveBeenCalledWith(
      "/",
      expect.objectContaining({
        query: { sessionId: "s1", userId: "u1", displayName: "Alice" },
        withCredentials: true,
      }),
    );
  });

  it("operation:applied réconcilie le store de tickets", () => {
    connectSocket("s1", "u1", "Alice");
    handlers["operation:applied"]({
      ticketId: "t1",
      field: "assigneeId",
      value: "m2",
      userId: "u1",
      clientTimestamp: 1,
      serverTimestamp: 2,
    });
    expect(useTicketsStore.getState().tickets[0].assigneeId).toBe("m2");
  });

  it("submitOperation applique l'optimiste et émet vers le serveur", () => {
    connectSocket("s1", "u1", "Alice");
    const op = { ticketId: "t1", field: "endDate" as const, value: "2026-06-20", userId: "u1", clientTimestamp: 1 };
    submitOperation(op);
    expect(useTicketsStore.getState().tickets[0].endDate).toBe("2026-06-20");
    expect(useTicketsStore.getState().tickets[0].syncStatus).toBe("pending");
    expect(fakeSocket.emit).toHaveBeenCalledWith("operation:submit", op);
  });

  it("ticket:updated remplace le ticket dans le store", () => {
    connectSocket("s1", "u1", "Alice");
    const updated = { ...base, assigneeId: "m3", syncStatus: "synced" as const, adoRev: 9 };
    handlers["ticket:updated"](updated);
    expect(useTicketsStore.getState().tickets[0]).toEqual(updated);
  });

  it("ticket:sync-status met à jour le syncStatus dans le store", () => {
    useTicketsStore.setState({ tickets: [base] });
    connectSocket("s1", "u1", "Alice");
    handlers["ticket:sync-status"]({ ticketId: "t1", syncStatus: "synced", adoRev: 2 });
    expect(useTicketsStore.getState().tickets[0].syncStatus).toBe("synced");
    expect(useTicketsStore.getState().tickets[0].adoRev).toBe(2);
  });

  it("disconnectSocket ferme la socket", () => {
    connectSocket("s1", "u1", "Alice");
    disconnectSocket();
    expect(fakeSocket.disconnect).toHaveBeenCalled();
    expect(getSocket()).toBeNull();
  });
});
