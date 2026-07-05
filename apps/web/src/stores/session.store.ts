import { create } from "zustand";
import type { SessionSnapshot } from "@moirai/shared";
import type { GroupBy } from "../utils/grouping";
import { useTicketsStore } from "./tickets.store";
import { usePresenceStore } from "./presence.store";
import { useCapacitiesStore } from "./capacities.store";
import { useMemberMetaStore } from "./memberMeta.store";

// Id de la session courante conservé pour restaurer le board au rafraîchissement.
const SID_KEY = "moirai.sessionId";
export function loadSessionId(): string | null {
  try { return localStorage.getItem(SID_KEY); } catch { return null; }
}

interface SessionState {
  snapshot: SessionSnapshot | null;
  groupBy: GroupBy;
  setSnapshot: (s: SessionSnapshot) => void;
  setGroupBy: (g: GroupBy) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  snapshot: null,
  groupBy: "user",
  setSnapshot: (snapshot) => {
    try { localStorage.setItem(SID_KEY, snapshot.sessionId); } catch { /* stockage indisponible */ }
    set({ snapshot });
  },
  setGroupBy: (groupBy) => set({ groupBy }),
  clear: () => {
    try { localStorage.removeItem(SID_KEY); } catch { /* stockage indisponible */ }
    set({ snapshot: null });
  },
}));

// Charge un snapshot dans tous les stores (lobby et restauration au boot).
export function applySnapshot(snapshot: SessionSnapshot) {
  useTicketsStore.getState().setTickets(snapshot.tickets);
  usePresenceStore.getState().setPeers(snapshot.participants);
  useCapacitiesStore.getState().setCapacities(snapshot.capacities ?? []);
  useMemberMetaStore.getState().setMemberMetas(snapshot.memberMeta ?? []);
  useSessionStore.getState().setSnapshot(snapshot);
}
