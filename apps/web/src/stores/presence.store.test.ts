import { describe, it, expect, beforeEach } from "vitest";
import type { PresenceState } from "@moirai/shared";
import { usePresenceStore } from "./presence.store";

function peer(partial: Partial<PresenceState>): PresenceState {
  return {
    userId: "u1",
    displayName: "Alice",
    color: "#FF6B6B",
    action: "idle",
    targetTicketId: null,
    ...partial,
  };
}

beforeEach(() => usePresenceStore.setState({ peers: [] }));

describe("presence.store", () => {
  it("setPeers remplace la liste", () => {
    usePresenceStore.getState().setPeers([peer({ userId: "u1" })]);
    expect(usePresenceStore.getState().peers).toHaveLength(1);
  });

  it("addPeer ajoute un pair idle et dédoublonne", () => {
    usePresenceStore.getState().addPeer({ userId: "u1", displayName: "Alice", color: "#FF6B6B" });
    usePresenceStore.getState().addPeer({ userId: "u1", displayName: "Alice", color: "#FF6B6B" });
    const peers = usePresenceStore.getState().peers;
    expect(peers).toHaveLength(1);
    expect(peers[0]).toMatchObject({ userId: "u1", action: "idle", targetTicketId: null });
  });

  it("updatePeer met à jour un pair existant", () => {
    usePresenceStore.getState().setPeers([peer({ userId: "u1" })]);
    usePresenceStore.getState().updatePeer(peer({ userId: "u1", action: "dragging", targetTicketId: "t1" }));
    expect(usePresenceStore.getState().peers[0]).toMatchObject({ action: "dragging", targetTicketId: "t1" });
  });

  it("removePeer retire le pair", () => {
    usePresenceStore.getState().setPeers([peer({ userId: "u1" }), peer({ userId: "u2" })]);
    usePresenceStore.getState().removePeer("u1");
    expect(usePresenceStore.getState().peers.map((p) => p.userId)).toEqual(["u2"]);
  });
});
