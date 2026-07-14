import { create } from "zustand";
import type { SessionSnapshot } from "@moirai/shared";
import { useTicketsStore } from "./tickets.store";
import { usePresenceStore } from "./presence.store";
import { useCapacitiesStore } from "./capacities.store";
import { useMemberMetaStore } from "./memberMeta.store";

// Id de la session courante conservé pour restaurer le board au rafraîchissement.
// Un lien d'invitation (?session=<id>, copié depuis le board) est prioritaire :
// capturé puis retiré de l'URL pour ne pas traîner dans l'historique/les partages.
const SID_KEY = "moirai.sessionId";
export function loadSessionId(): string | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("session");
    if (fromUrl) {
      localStorage.setItem(SID_KEY, fromUrl);
      window.history.replaceState(null, "", window.location.pathname);
      return fromUrl;
    }
    return localStorage.getItem(SID_KEY);
  } catch { return null; }
}

interface SessionState {
  snapshot: SessionSnapshot | null;
  setSnapshot: (s: SessionSnapshot) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  snapshot: null,
  setSnapshot: (snapshot) => {
    try { localStorage.setItem(SID_KEY, snapshot.sessionId); } catch { /* stockage indisponible */ }
    set({ snapshot });
  },
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
