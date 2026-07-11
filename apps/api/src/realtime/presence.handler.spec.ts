import { PresenceHandler } from "./presence.handler";
import type { PresenceState } from "@moirai/shared";

function makeClient(data: any) {
  const emit = jest.fn();
  return { client: { data, to: jest.fn().mockReturnValue({ emit }) }, emit };
}

function makeRedis() {
  return {
    setPresence: jest.fn().mockResolvedValue(undefined),
    addParticipant: jest.fn().mockResolvedValue(undefined),
    removePresence: jest.fn().mockResolvedValue(undefined),
    removeParticipant: jest.fn().mockResolvedValue(undefined),
  };
}

describe("PresenceHandler", () => {
  it("handleJoin enregistre la présence et notifie user-joined", async () => {
    const redis = makeRedis();
    const handler = new PresenceHandler(redis as any);
    const { client, emit } = makeClient({ sessionId: "s1", userId: "u1", displayName: "Alice" });

    await handler.handleJoin({} as any, client as any);

    expect(redis.setPresence).toHaveBeenCalled();
    expect(redis.addParticipant).toHaveBeenCalledWith("s1", "u1");
    expect(client.to).toHaveBeenCalledWith("session:s1");
    expect(emit).toHaveBeenCalledWith(
      "presence:user-joined",
      expect.objectContaining({ userId: "u1", displayName: "Alice" }),
    );
  });

  it("handleUpdate persiste et diffuse presence:broadcast, en imposant l'identité de la socket", async () => {
    const redis = makeRedis();
    const handler = new PresenceHandler(redis as any);
    const { client, emit } = makeClient({ sessionId: "s1", userId: "u1" });
    const p: PresenceState = {
      userId: "victim", // usurpation tentée
      displayName: "Alice",
      color: "#FF6B6B",
      action: "dragging",
      targetTicketId: "t1",
    };

    await handler.handleUpdate({} as any, client as any, p);

    const expected = { ...p, userId: "u1" };
    expect(redis.setPresence).toHaveBeenCalledWith("s1", expected);
    expect(emit).toHaveBeenCalledWith("presence:broadcast", expected);
  });

  it("handleUpdate ignore un payload malformé (champs arbitraires, types invalides)", async () => {
    const redis = makeRedis();
    const handler = new PresenceHandler(redis as any);
    const { client, emit } = makeClient({ sessionId: "s1", userId: "u1" });

    for (const bad of [
      { displayName: 1, color: "#fff", action: "idle", targetTicketId: null },
      { displayName: "A", color: "#fff", action: "hacked", targetTicketId: null },
      { displayName: "A", color: "#fff", action: "idle", targetTicketId: 42 },
    ]) {
      await handler.handleUpdate({} as any, client as any, bad as any);
    }

    expect(redis.setPresence).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("handleUpdate tronque les chaînes hors gabarit et ignore les champs inconnus", async () => {
    const redis = makeRedis();
    const handler = new PresenceHandler(redis as any);
    const { client } = makeClient({ sessionId: "s1", userId: "u1" });

    await handler.handleUpdate({} as any, client as any, {
      userId: "u1",
      displayName: "x".repeat(500),
      color: "#FF6B6B",
      action: "idle",
      targetTicketId: null,
      injected: "payload",
    } as any);

    const stored = redis.setPresence.mock.calls[0][1];
    expect(stored.displayName).toHaveLength(200);
    expect(stored).not.toHaveProperty("injected");
  });

  it("handleLeave nettoie la présence et notifie user-left", async () => {
    const redis = makeRedis();
    const handler = new PresenceHandler(redis as any);
    const { client, emit } = makeClient({ sessionId: "s1", userId: "u1" });

    await handler.handleLeave({} as any, client as any);

    expect(redis.removePresence).toHaveBeenCalledWith("s1", "u1");
    expect(redis.removeParticipant).toHaveBeenCalledWith("s1", "u1");
    expect(emit).toHaveBeenCalledWith("presence:user-left", { userId: "u1" });
  });

  it("handleLeave ne fait rien sans données de session", async () => {
    const redis = makeRedis();
    const handler = new PresenceHandler(redis as any);
    const { client } = makeClient({});
    await handler.handleLeave({} as any, client as any);
    expect(redis.removePresence).not.toHaveBeenCalled();
  });
});
