import { PresenceHandler } from "./presence.handler";
import type { PresenceState } from "@moires/shared";

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

  it("handleUpdate persiste et diffuse presence:broadcast aux autres", async () => {
    const redis = makeRedis();
    const handler = new PresenceHandler(redis as any);
    const { client, emit } = makeClient({ sessionId: "s1" });
    const p: PresenceState = {
      userId: "u1",
      displayName: "Alice",
      color: "#FF6B6B",
      action: "dragging",
      targetTicketId: "t1",
    };

    await handler.handleUpdate({} as any, client as any, p);

    expect(redis.setPresence).toHaveBeenCalledWith("s1", p);
    expect(emit).toHaveBeenCalledWith("presence:broadcast", p);
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
