import { describe, it, expect, beforeEach } from "vitest";
import type { SessionSnapshot } from "@moires/shared";
import { useSessionStore } from "./session.store";

const snapshot: SessionSnapshot = {
  sessionId: "s1",
  tickets: [],
  participants: [],
  teamMembers: [],
  iterations: [],
  capacities: [],
};

beforeEach(() => useSessionStore.setState({ snapshot: null }));

describe("session.store", () => {
  it("setSnapshot stocke le snapshot", () => {
    useSessionStore.getState().setSnapshot(snapshot);
    expect(useSessionStore.getState().snapshot).toEqual(snapshot);
  });

  it("clear réinitialise à null", () => {
    useSessionStore.getState().setSnapshot(snapshot);
    useSessionStore.getState().clear();
    expect(useSessionStore.getState().snapshot).toBeNull();
  });
});
