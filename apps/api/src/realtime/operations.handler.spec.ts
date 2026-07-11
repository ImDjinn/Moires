import { OperationsHandler } from "./operations.handler";
import type { Operation } from "@moirai/shared";

const op: Operation = {
  ticketId: "t1",
  field: "assigneeId",
  value: "m2",
  userId: "u1",
  clientTimestamp: 1,
};

function makeServer() {
  const emit = jest.fn();
  const server = { to: jest.fn().mockReturnValue({ emit }) };
  return { server, emit };
}

describe("OperationsHandler", () => {
  it("applique l'opération et diffuse operation:applied à la room", async () => {
    const sessions = { applyOperation: jest.fn().mockResolvedValue(undefined) };
    const handler = new OperationsHandler(sessions as any);
    const { server, emit } = makeServer();
    const client = { data: { sessionId: "s1", userId: "u1" }, emit: jest.fn() };

    await handler.handle(server as any, client as any, op);

    expect(sessions.applyOperation).toHaveBeenCalledWith("s1", op);
    expect(server.to).toHaveBeenCalledWith("session:s1");
    expect(emit).toHaveBeenCalledWith(
      "operation:applied",
      expect.objectContaining({ ticketId: "t1", serverTimestamp: expect.any(Number) }),
    );
  });

  it("émet operation:rejected à l'émetteur en cas d'échec", async () => {
    const sessions = { applyOperation: jest.fn().mockRejectedValue(new Error("conflit")) };
    const handler = new OperationsHandler(sessions as any);
    const { server } = makeServer();
    const client = { data: { sessionId: "s1", userId: "u1" }, emit: jest.fn() };

    await handler.handle(server as any, client as any, op);

    // Le détail ("conflit") reste côté serveur : le client reçoit un message générique.
    expect(client.emit).toHaveBeenCalledWith("operation:rejected", { op, reason: "Operation failed" });
  });

  it("rejette un champ hors liste blanche sans l'appliquer (empoisonnement du cache)", async () => {
    const sessions = { applyOperation: jest.fn() };
    const handler = new OperationsHandler(sessions as any);
    const { server } = makeServer();
    const client = { data: { sessionId: "s1", userId: "u1" }, emit: jest.fn() };

    for (const bad of [
      { ...op, field: "adoRev" as any },      // propriété interne du ticket
      { ...op, field: "custom:" as any },     // custom vide
      { ...op, value: { nested: true } as any }, // valeur non scalaire
      { ...op, ticketId: 42 as any },
      { ...op, value: "x".repeat(65537) },          // chaîne au-delà du plafond
      { ...op, value: ["x".repeat(65537)] },        // tableau au-delà du plafond
    ]) {
      await handler.handle(server as any, client as any, bad);
    }

    expect(sessions.applyOperation).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(
      "operation:rejected",
      expect.objectContaining({ reason: "Invalid operation" }),
    );
  });

  it("accepte un champ custom: et un tableau de chaînes (tags)", async () => {
    const sessions = { applyOperation: jest.fn().mockResolvedValue(undefined) };
    const handler = new OperationsHandler(sessions as any);
    const { server } = makeServer();
    const client = { data: { sessionId: "s1", userId: "u1" }, emit: jest.fn() };

    await handler.handle(server as any, client as any, { ...op, field: "custom:My.Field", value: 3 });
    await handler.handle(server as any, client as any, { ...op, field: "tags", value: ["a", "b"] });

    expect(sessions.applyOperation).toHaveBeenCalledTimes(2);
  });

  it("écrase op.userId falsifié par l'identité de la socket", async () => {
    const sessions = { applyOperation: jest.fn().mockResolvedValue(undefined) };
    const handler = new OperationsHandler(sessions as any);
    const { server } = makeServer();
    const client = { data: { sessionId: "s1", userId: "real-user" }, emit: jest.fn() };
    const spoofed: Operation = { ...op, userId: "victim" };

    await handler.handle(server as any, client as any, spoofed);

    expect(spoofed.userId).toBe("real-user");
    expect(sessions.applyOperation).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ userId: "real-user" }),
    );
  });
});
