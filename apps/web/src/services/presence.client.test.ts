import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { PresenceState } from "@moires/shared";
import { usePresenceStore } from "../stores/presence.store";

const handlers: Record<string, (...a: any[]) => void> = {};
const fakeSocket = {
  on: vi.fn((event: string, h: (...a: any[]) => void) => {
    handlers[event] = h;
  }),
  emit: vi.fn(),
};

vi.mock("./operations.client", () => ({ getSocket: () => fakeSocket }));

import { initPresenceListeners, emitPresence, trackAway, AWAY_MS } from "./presence.client";

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

  it("presence:sync remplace la liste (resynchronisation après reconnexion)", () => {
    initPresenceListeners();

    handlers["presence:user-joined"]({ userId: "ghost", displayName: "Parti", color: "#000" });
    handlers["presence:sync"]([peer({ userId: "u2", displayName: "Bob" })]);

    expect(usePresenceStore.getState().peers).toEqual([expect.objectContaining({ userId: "u2" })]);
  });
});

describe("presence.client — inactivité d'onglet", () => {
  function setHidden(hidden: boolean) {
    Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  }

  it("passe away après AWAY_MS d'onglet masqué, redevient idle au retour", () => {
    vi.useFakeTimers();
    setHidden(false);
    const stop = trackAway(peer({ userId: "me" }));
    fakeSocket.emit.mockClear(); // émission initiale (onglet visible au montage)

    setHidden(true);
    vi.advanceTimersByTime(AWAY_MS - 1);
    expect(fakeSocket.emit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fakeSocket.emit).toHaveBeenCalledWith(
      "presence:update",
      expect.objectContaining({ userId: "me", action: "away", cursor: undefined }),
    );

    setHidden(false);
    expect(fakeSocket.emit).toHaveBeenLastCalledWith(
      "presence:update",
      expect.objectContaining({ action: "idle" }),
    );

    stop();
    vi.useRealTimers();
  });

  it("un aller-retour rapide sur l'onglet ne déclenche pas away", () => {
    vi.useFakeTimers();
    setHidden(false);
    const stop = trackAway(peer({ userId: "me" }));

    setHidden(true);
    vi.advanceTimersByTime(AWAY_MS / 2);
    setHidden(false);
    fakeSocket.emit.mockClear();
    vi.advanceTimersByTime(AWAY_MS);

    expect(fakeSocket.emit).not.toHaveBeenCalled();
    stop();
    vi.useRealTimers();
  });

  it("le désabonnement annule le minuteur en cours", () => {
    vi.useFakeTimers();
    setHidden(false);
    const stop = trackAway(peer({ userId: "me" }));
    setHidden(true);
    stop();
    fakeSocket.emit.mockClear();
    vi.advanceTimersByTime(AWAY_MS * 2);

    expect(fakeSocket.emit).not.toHaveBeenCalled();
    vi.useRealTimers();
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
