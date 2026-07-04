import { create } from "zustand";
import type { SessionSnapshot } from "@moirai/shared";
import type { GroupBy } from "../utils/grouping";

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
  setSnapshot: (snapshot) => set({ snapshot }),
  setGroupBy: (groupBy) => set({ groupBy }),
  clear: () => set({ snapshot: null }),
}));
