import { create } from "zustand";
import type { PresenceState } from "@moires/shared";

interface PresenceStore {
  peers: PresenceState[];
  setPeers: (peers: PresenceState[]) => void;
  updatePeer: (p: PresenceState) => void;
  addPeer: (p: Pick<PresenceState, "userId" | "displayName" | "color">) => void;
  removePeer: (userId: string) => void;
}

export const usePresenceStore = create<PresenceStore>((set) => ({
  peers: [],
  setPeers: (peers) => set({ peers }),
  updatePeer: (p) =>
    set((state) => ({
      peers: state.peers.map((peer) => (peer.userId === p.userId ? p : peer)),
    })),
  addPeer: (p) =>
    set((state) => ({
      peers: [
        ...state.peers.filter((peer) => peer.userId !== p.userId),
        { ...p, action: "idle" as const, targetTicketId: null },
      ],
    })),
  removePeer: (userId) =>
    set((state) => ({
      peers: state.peers.filter((p) => p.userId !== userId),
    })),
}));
