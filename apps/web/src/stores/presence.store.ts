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
  // Upsert : un `user-joined` manqué (ou un `user-left` parasite émis par une
  // socket morte du même utilisateur) ferait disparaître le pair définitivement.
  // Son prochain `presence:broadcast` le réinsère.
  updatePeer: (p) =>
    set((state) =>
      state.peers.some((peer) => peer.userId === p.userId)
        ? { peers: state.peers.map((peer) => (peer.userId === p.userId ? p : peer)) }
        : { peers: [...state.peers, p] },
    ),
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
