import { SessionsService } from "./sessions.service";
import type { Operation, Ticket } from "@moires/shared";

function makeService() {
  const prisma = {
    planningSession: { create: jest.fn() },
    operationsLog: { create: jest.fn(), findMany: jest.fn() },
  };
  const redis = {
    getTicket: jest.fn(),
    updateTicket: jest.fn(),
    addParticipant: jest.fn(),
    getTickets: jest.fn(),
    getPresences: jest.fn(),
  };
  const sync = { syncInitial: jest.fn() };
  const writeback = { enqueue: jest.fn() };
  const service = new SessionsService(
    prisma as any,
    redis as any,
    sync as any,
    writeback as any,
  );
  return { service, prisma, redis, sync, writeback };
}

const ticket: Ticket = {
  id: "t1",
  title: "T",
  assigneeId: "m1",
  areaPath: "",
  iterationId: "it1",
  startDate: "2026-06-10",
  endDate: "2026-06-11",
  estimateHours: 8,
  adoRev: 1,
  syncStatus: "synced",
};

describe("SessionsService.createSession", () => {
  it("crée la session, lance la sync initiale et renvoie le snapshot", async () => {
    const { service, prisma, redis, sync } = makeService();
    prisma.planningSession.create.mockResolvedValue({ id: "s1" });
    sync.syncInitial.mockResolvedValue({
      tickets: [ticket],
      teamMembers: [{ id: "m1", displayName: "Alice", capacityHoursPerDay: 8 }],
    });
    redis.addParticipant.mockResolvedValue(undefined);

    const snapshot = await service.createSession(
      { adoProjectId: "p1", adoIterationIds: ["it1"] },
      "u1",
      "token",
    );

    expect(snapshot.sessionId).toBe("s1");
    expect(snapshot.tickets).toEqual([ticket]);
    expect(snapshot.teamMembers).toHaveLength(1);
    expect(redis.addParticipant).toHaveBeenCalledWith("s1", "u1");
  });
});

describe("SessionsService.applyOperation", () => {
  it("applique l'opération, journalise et enfile le write-back", async () => {
    const { service, redis, prisma, writeback } = makeService();
    redis.getTicket.mockResolvedValue({ ...ticket });
    redis.updateTicket.mockResolvedValue(undefined);
    prisma.operationsLog.create.mockResolvedValue({ id: "log1" });
    writeback.enqueue.mockResolvedValue(undefined);

    const op: Operation = {
      ticketId: "t1",
      field: "assigneeId",
      value: "m2",
      userId: "u1",
      clientTimestamp: 1,
    };
    const result = await service.applyOperation("s1", op);

    expect(result.assigneeId).toBe("m2");
    expect(result.syncStatus).toBe("pending");
    expect(prisma.operationsLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: "s1",
        ticketId: "t1",
        field: "assigneeId",
        oldValue: "m1",
        newValue: "m2",
        performedBy: "u1",
      }),
    });
    expect(writeback.enqueue).toHaveBeenCalledWith("s1", op, "log1");
  });

  it("rejette si le ticket est introuvable", async () => {
    const { service, redis } = makeService();
    redis.getTicket.mockResolvedValue(null);
    await expect(
      service.applyOperation("s1", {
        ticketId: "absent",
        field: "assigneeId",
        value: "m2",
        userId: "u1",
        clientTimestamp: 1,
      }),
    ).rejects.toThrow("not found");
  });
});

describe("SessionsService.getSnapshot", () => {
  it("assemble tickets et présences depuis Redis", async () => {
    const { service, redis } = makeService();
    redis.getTickets.mockResolvedValue([ticket]);
    redis.getPresences.mockResolvedValue([{ userId: "u1" }]);

    const snapshot = await service.getSnapshot("s1");

    expect(snapshot).toEqual({
      sessionId: "s1",
      tickets: [ticket],
      participants: [{ userId: "u1" }],
      teamMembers: [],
    });
  });
});

describe("SessionsService.getAuditLog", () => {
  it("renvoie le journal trié par date décroissante", async () => {
    const { service, prisma } = makeService();
    prisma.operationsLog.findMany.mockResolvedValue([{ id: "log1" }]);

    const log = await service.getAuditLog("s1");

    expect(log).toEqual([{ id: "log1" }]);
    expect(prisma.operationsLog.findMany).toHaveBeenCalledWith({
      where: { sessionId: "s1" },
      orderBy: { performedAt: "desc" },
    });
  });
});
