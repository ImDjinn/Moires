import { create } from "zustand";
import type { Ticket, Operation } from "@moirai/shared";
import { setTicketField } from "@moirai/shared";

interface TicketsState {
  tickets: Ticket[];
  setTickets: (tickets: Ticket[]) => void;
  applyOperation: (op: Operation) => void;
  updateTicket: (ticket: Ticket) => void;
  /** Remplace plusieurs tickets en un seul set (un re-render au lieu de N au poll). */
  updateTickets: (tickets: Ticket[]) => void;
  updateSyncStatus: (ticketId: string, syncStatus: Ticket["syncStatus"], adoRev?: number) => void;
}

export const useTicketsStore = create<TicketsState>((set) => ({
  tickets: [],
  setTickets: (tickets) => set({ tickets }),
  applyOperation: (op) =>
    set((state) => ({
      tickets: state.tickets.map((t) => {
        if (t.id !== op.ticketId) return t;
        const next = { ...t, syncStatus: "pending" as const };
        setTicketField(next, op.field, op.value);
        return next;
      }),
    })),
  updateTicket: (ticket) =>
    set((state) => ({
      tickets: state.tickets.map((t) => (t.id === ticket.id ? ticket : t)),
    })),
  updateTickets: (incoming) =>
    set((state) => {
      const byId = new Map(incoming.map((t) => [t.id, t]));
      return { tickets: state.tickets.map((t) => byId.get(t.id) ?? t) };
    }),
  updateSyncStatus: (ticketId, syncStatus, adoRev) =>
    set((state) => ({
      tickets: state.tickets.map((t) =>
        t.id === ticketId
          ? { ...t, syncStatus, ...(adoRev !== undefined ? { adoRev } : {}) }
          : t,
      ),
    })),
}));
