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
    const client = { data: { sessionId: "s1" }, emit: jest.fn() };

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
    const client = { data: { sessionId: "s1" }, emit: jest.fn() };

    await handler.handle(server as any, client as any, op);

    expect(client.emit).toHaveBeenCalledWith("operation:rejected", { op, reason: "conflit" });
  });
});
