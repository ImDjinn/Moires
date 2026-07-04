import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { PresenceState } from "@moirai/shared";
import { usePresenceStore } from "../stores/presence.store";

const handlers: Record<string, (...a: any[]) => void> = {};
const fakeSocket = {
  on: vi.fn((event: string, h: (...a: any[]) => void) => {
    handlers[event] = h;
  }),
  emit: vi.fn(),
};

vi.mock("./operations.client", () => ({ getSocket: () => fakeSocket }));

import { initPresenceListeners, emitPresence } from "./presence.client";

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

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(handlers)) delete handlers[k];
  usePresenceStore.setState({ peers: [] });
});

afterEach(() => vi.restoreAllMocks());

describe("presence.client — écouteurs", () => {
  it("user-joined ajoute le pair, broadcast le met à jour, user-left le retire", () => {
    initPresenceListeners();

    handlers["presence:user-joined"]({ userId: "u2", displayName: "Bob", color: "#4ECDC4" });
    expect(usePresenceStore.getState().peers).toHaveLength(1);

    handlers["presence:broadcast"](peer({ userId: "u2", action: "dragging", targetTicketId: "t1" }));
    expect(usePresenceStore.getState().peers[0]).toMatchObject({ action: "dragging" });

    handlers["presence:user-left"]({ userId: "u2" });
    expect(usePresenceStore.getState().peers).toHaveLength(0);
  });
});

describe("presence.client — throttle d'émission", () => {
  it("ne ré-émet pas en deçà de la fenêtre de throttle", () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1000);
    emitPresence(peer({}));
    now.mockReturnValue(1010); // +10ms < 50ms => ignoré
    emitPresence(peer({}));
    now.mockReturnValue(1100); // +90ms > 50ms => émis
    emitPresence(peer({}));
    expect(fakeSocket.emit).toHaveBeenCalledTimes(2);
  });
});
