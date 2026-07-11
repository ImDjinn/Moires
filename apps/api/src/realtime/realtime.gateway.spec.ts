import { createHmac } from "crypto";
import { RealtimeGateway } from "./realtime.gateway";
import type { Operation, PresenceState } from "@moirai/shared";

const SECRET = "test-secret";

// Reproduit cookie-signature.sign : val + "." + HMAC-SHA256 base64 sans '=' final.
function signedCookie(name: string, value: string): string {
  const mac = createHmac("sha256", SECRET).update(value).digest("base64").replace(/=+$/, "");
  return `${name}=${encodeURIComponent("s:" + value + "." + mac)}`;
}

const aliceCookie = signedCookie(
  "session_user",
  JSON.stringify({ id: "u1", displayName: "Alice", exp: Date.now() + 3600_000 }),
);

function makeGateway(createdBy = "u1") {
  const operationsHandler = { handle: jest.fn() };
  const presenceHandler = { handleJoin: jest.fn(), handleLeave: jest.fn(), handleUpdate: jest.fn() };
  const redis = {
    getParticipants: jest.fn().mockResolvedValue([]),
  };
  const broadcast = { setServer: jest.fn(), send: jest.fn() };
  const prisma = { planningSession: { findUnique: jest.fn().mockResolvedValue({ createdBy }) } };
  const config = { get: (k: string) => (k === "SESSION_SECRET" ? SECRET : undefined) };
  const gateway = new RealtimeGateway(
    operationsHandler as any,
    presenceHandler as any,
    redis as any,
    broadcast as any,
    prisma as any,
    config as any,
  );
  gateway.server = {} as any;
  return { gateway, operationsHandler, presenceHandler, redis, broadcast, prisma };
}

function makeClient(cookie: string | undefined, query: Record<string, string>): any {
  return {
    handshake: { query, headers: cookie ? { cookie } : {} },
    join: jest.fn(),
    disconnect: jest.fn(),
    data: {},
  };
}

describe("RealtimeGateway", () => {
  it("dérive l'identité du cookie signé, rejoint la room et déclenche la présence", async () => {
    const { gateway, presenceHandler } = makeGateway();
    const client = makeClient(aliceCookie, { sessionId: "s1", userId: "SPOOF", displayName: "SPOOF" });

    await gateway.handleConnection(client);

    // userId/displayName viennent du cookie, jamais des query params falsifiés.
    expect(client.data).toEqual({ sessionId: "s1", userId: "u1", displayName: "Alice" });
    expect(client.join).toHaveBeenCalledWith("session:s1");
    expect(presenceHandler.handleJoin).toHaveBeenCalled();
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("déconnecte sans cookie de session valide", async () => {
    const { gateway, presenceHandler } = makeGateway();
    const client = makeClient(undefined, { sessionId: "s1", userId: "u1" });

    await gateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
    expect(presenceHandler.handleJoin).not.toHaveBeenCalled();
  });

  it("déconnecte si sessionId manquant", async () => {
    const { gateway } = makeGateway();
    const client = makeClient(aliceCookie, {});
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalled();
  });

  it("déconnecte un cookie signé avec une signature invalide", async () => {
    const { gateway } = makeGateway();
    const forged = "session_user=" + encodeURIComponent("s:" + JSON.stringify({ id: "attacker" }) + ".badsig");
    const client = makeClient(forged, { sessionId: "s1" });
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it("déconnecte un cookie expiré (exp dépassé)", async () => {
    const { gateway } = makeGateway();
    const expired = signedCookie(
      "session_user",
      JSON.stringify({ id: "u1", displayName: "Alice", exp: Date.now() - 1 }),
    );
    const client = makeClient(expired, { sessionId: "s1" });
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it("déconnecte un utilisateur qui n'est pas membre de la session", async () => {
    const { gateway, presenceHandler } = makeGateway("someone-else");
    const client = makeClient(aliceCookie, { sessionId: "s1" });
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalled();
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
