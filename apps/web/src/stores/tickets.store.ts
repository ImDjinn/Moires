import { create } from "zustand";
import type { Ticket, Operation } from "@moires/shared";

interface TicketsState {
  tickets: Ticket[];
  setTickets: (tickets: Ticket[]) => void;
  applyOperation: (op: Operation) => void;
  updateTicket: (ticket: Ticket) => void;
  updateSyncStatus: (ticketId: string, syncStatus: Ticket["syncStatus"], adoRev?: number) => void;
}

export const useTicketsStore = create<TicketsState>((set) => ({
  tickets: [],
  setTickets: (tickets) => set({ tickets }),
  applyOperation: (op) =>
    set((state) => ({
      tickets: state.tickets.map((t) =>
        t.id === op.ticketId
          ? { ...t, [op.field]: op.value, syncStatus: "pending" as const }
          : t,
      ),
    })),
  updateTicket: (ticket) =>
    set((state) => ({
      tickets: state.tickets.map((t) => (t.id === ticket.id ? ticket : t)),
    })),
  updateSyncStatus: (ticketId, syncStatus, adoRev) =>
    set((state) => ({
      tickets: state.tickets.map((t) =>
        t.id === ticketId
          ? { ...t, syncStatus, ...(adoRev !== undefined ? { adoRev } : {}) }
          : t,
      ),
    })),
}));
