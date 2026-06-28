import { create } from "zustand";
import type { SessionSnapshot } from "@moires/shared";

interface SessionState {
  snapshot: SessionSnapshot | null;
  setSnapshot: (s: SessionSnapshot) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  snapshot: null,
  setSnapshot: (snapshot) => set({ snapshot }),
  clear: () => set({ snapshot: null }),
}));
