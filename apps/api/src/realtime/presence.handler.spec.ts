import { PresenceHandler } from "./presence.handler";
import type { PresenceState } from "@moires/shared";

function makeClient(data: any) {
  const emit = jest.fn();
  return { client: { data, emit: jest.fn(), to: jest.fn().mockReturnValue({ emit }) }, emit };
}

// Sockets réellement dans la room (source de vérité de « qui est connecté »).
function makeServer(userIds: string[] = []) {
  return {
    in: jest.fn().mockReturnValue({
      fetchSockets: jest.fn().mockResolvedValue(userIds.map((userId) => ({ data: { userId } }))),
    }),
  };
}

function makeRedis(presences: PresenceState[] = []) {
  return {
    setPresence: jest.fn().mockResolvedValue(undefined),
    addParticipant: jest.fn().mockResolvedValue(undefined),
    removePresence: jest.fn().mockResolvedValue(undefined),
    removeParticipant: jest.fn().mockResolvedValue(undefined),
    getPresences: jest.fn().mockResolvedValue(presences),
  };
}

function presence(userId: string): PresenceState {
  return { userId, displayName: userId, color: "#FF6B6B", action: "idle", targetTicketId: null };
}

describe("PresenceHandler", () => {
  it("handleJoin enregistre la présence et notifie user-joined", async () => {
    const redis = makeRedis();
    const handler = new PresenceHandler(redis as any);
    const { client, emit } = makeClient({ sessionId: "s1", userId: "u1", displayName: "Alice" });

    await handler.handleJoin(makeServer(["u1"]) as any, client as any);

    expect(redis.setPresence).toHaveBeenCalled();
    expect(redis.addParticipant).toHaveBeenCalledWith("s1", "u1");
    expect(client.to).toHaveBeenCalledWith("session:s1");
    expect(emit).toHaveBeenCalledWith(
      "presence:user-joined",
      expect.objectContaining({ userId: "u1", displayName: "Alice" }),
    );
  });

  it("handleJoin renvoie à l'arrivant les présences des sockets connectées, sans les fantômes Redis", async () => {
    // u2 est connecté ; u3 a laissé une présence dans Redis (arrêt brutal de l'API).
    const redis = makeRedis([presence("u1"), presence("u2"), presence("u3")]);
    const handler = new PresenceHandler(redis as any);
    const { client } = makeClient({ sessionId: "s1", userId: "u1", displayName: "Alice" });

    await handler.handleJoin(makeServer(["u1", "u2"]) as any, client as any);

    expect(client.emit).toHaveBeenCalledWith("presence:sync", [
      expect.objectContaining({ userId: "u1" }),
      expect.objectContaining({ userId: "u2" }),
    ]);
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
