import { RealtimeGateway } from "./realtime.gateway";
import type { Operation, PresenceState } from "@moires/shared";

function makeGateway() {
  const operationsHandler = { handle: jest.fn() };
  const presenceHandler = { handleJoin: jest.fn(), handleLeave: jest.fn(), handleUpdate: jest.fn() };
  const redis = { setUserToken: jest.fn().mockResolvedValue(undefined) };
  const broadcast = { setServer: jest.fn(), send: jest.fn() };
  const gateway = new RealtimeGateway(
    operationsHandler as any,
    presenceHandler as any,
    redis as any,
    broadcast as any,
  );
  gateway.server = {} as any;
  return { gateway, operationsHandler, presenceHandler, redis, broadcast };
}

describe("RealtimeGateway", () => {
  it("handleConnection rejoint la room et déclenche la présence", async () => {
    const { gateway, presenceHandler } = makeGateway();
    const client: any = {
      handshake: { query: { sessionId: "s1", userId: "u1", displayName: "Alice" }, headers: {} },
      join: jest.fn(),
      disconnect: jest.fn(),
      data: {},
    };

    await gateway.handleConnection(client);

    expect(client.data).toEqual({ sessionId: "s1", userId: "u1", displayName: "Alice" });
    expect(client.join).toHaveBeenCalledWith("session:s1");
    expect(presenceHandler.handleJoin).toHaveBeenCalled();
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("handleConnection stocke le token ADO issu du cookie", async () => {
    const { gateway, redis } = makeGateway();
    const client: any = {
      handshake: {
        query: { sessionId: "s1", userId: "u1", displayName: "Alice" },
        headers: { cookie: "session_user=...; ado_token=tok123; ado_org=myorg" },
      },
      join: jest.fn(),
      disconnect: jest.fn(),
      data: {},
    };

    await gateway.handleConnection(client);

    expect(redis.setUserToken).toHaveBeenCalledWith("s1", "u1", "tok123");
  });

  it("handleConnection déconnecte si sessionId/userId manquants", async () => {
    const { gateway, presenceHandler } = makeGateway();
    const client: any = {
      handshake: { query: { sessionId: "s1" }, headers: {} },
      join: jest.fn(),
      disconnect: jest.fn(),
    };

    await gateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
    expect(presenceHandler.handleJoin).not.toHaveBeenCalled();
  });

  it("afterInit enregistre le server dans BroadcastService", () => {
    const { gateway, broadcast } = makeGateway();
    const server = {} as any;
    gateway.afterInit(server);
    expect(broadcast.setServer).toHaveBeenCalledWith(server);
  });

  it("relaie operation:submit vers le handler d'opérations", async () => {
    const { gateway, operationsHandler } = makeGateway();
    const client: any = { data: { sessionId: "s1" } };
    const op = {} as Operation;
    await gateway.handleOperation(client, op);
    expect(operationsHandler.handle).toHaveBeenCalledWith(gateway.server, client, op);
  });

  it("relaie presence:update vers le handler de présence", async () => {
    const { gateway, presenceHandler } = makeGateway();
    const client: any = { data: { sessionId: "s1" } };
    const p = {} as PresenceState;
    await gateway.handlePresence(client, p);
    expect(presenceHandler.handleUpdate).toHaveBeenCalledWith(gateway.server, client, p);
  });
});
