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
    setIterations: jest.fn().mockResolvedValue(undefined),
    getIterations: jest.fn().mockResolvedValue([]),
    setTeamMembers: jest.fn().mockResolvedValue(undefined),
    getTeamMembers: jest.fn().mockResolvedValue([]),
    getCapacities: jest.fn().mockResolvedValue([]),
    setCapacities: jest.fn().mockResolvedValue(undefined),
    getStates: jest.fn().mockResolvedValue([]),
    setStates: jest.fn().mockResolvedValue(undefined),
  };
  const ado = { getIterations: jest.fn().mockResolvedValue([]) };
  const sync = { syncInitial: jest.fn() };
  const writeback = { enqueue: jest.fn() };
  const service = new SessionsService(
    prisma as any,
    redis as any,
    ado as any,
    sync as any,
    writeback as any,
  );
  return { service, prisma, redis, ado, sync, writeback };
}

const ticket: Ticket = {
  id: "t1",
  title: "T",
  assigneeId: "m1",
  areaPath: "",
  iterationId: "it1",
  epicId: null,
  epicTitle: null,
  workItemType: "User Story",
  parentId: null,
  state: "New",
  tags: [],
  targetDate: null,
  startDate: "2026-06-10",
  endDate: "2026-06-11",
  estimateHours: 8,
  storyPoints: 3,
  adoRev: 1,
  syncStatus: "synced",
};

describe("SessionsService.createSession", () => {
  it("dérive les itérations du projet, lance la sync initiale et renvoie le snapshot", async () => {
    const { service, prisma, redis, ado, sync } = makeService();
    ado.getIterations.mockResolvedValue([
      { id: "it1", name: "Sprint 1", path: "P\\S1", startDate: "2026-06-01", finishDate: "2026-06-14" },
      { id: "it0", name: "Backlog", path: "P", startDate: undefined, finishDate: undefined },
    ]);
    prisma.planningSession.create.mockResolvedValue({ id: "s1" });
    sync.syncInitial.mockResolvedValue({
      tickets: [ticket],
      teamMembers: [{ id: "m1", displayName: "Alice", capacityHoursPerDay: 8 }],
    });
    redis.addParticipant.mockResolvedValue(undefined);

    const snapshot = await service.createSession(
      { adoProjectId: "p1" },
      "u1",
      "orgX",
      "token",
    );

    expect(snapshot.sessionId).toBe("s1");
    expect(snapshot.tickets).toEqual([ticket]);
    expect(snapshot.teamMembers).toHaveLength(1);
    // seule l'itération datée est retenue, et exposée dans le snapshot
    expect(snapshot.iterations).toEqual([
      { id: "it1", name: "Sprint 1", path: "P\\S1", startDate: "2026-06-01", finishDate: "2026-06-14" },
    ]);
    expect(redis.setIterations).toHaveBeenCalledWith("s1", snapshot.iterations);
    expect(redis.addParticipant).toHaveBeenCalledWith("s1", "u1");
    expect(prisma.planningSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ adoOrg: "orgX", adoIterationIds: ["it1"] }),
    });
    expect(sync.syncInitial).toHaveBeenCalledWith("s1", "orgX", "p1", ["it1"], "token", undefined);
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
      teamMembers: [],  // mock retourne [] par défaut
      iterations: [],
      capacities: [],
      states: [],
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
