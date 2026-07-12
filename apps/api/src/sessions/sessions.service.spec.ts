import { SessionsService } from "./sessions.service";
import type { Operation, Ticket } from "@moirai/shared";

function makeService() {
  const prisma = {
    planningSession: { create: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
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
    getStates: jest.fn().mockResolvedValue([]),
    setStates: jest.fn().mockResolvedValue(undefined),
  };
  const capacities = {
    list: jest.fn().mockResolvedValue([]),
    set: jest.fn().mockResolvedValue(undefined),
    seed: jest.fn().mockResolvedValue(undefined),
  };
  const memberMeta = {
    list: jest.fn().mockResolvedValue([]),
    set: jest.fn().mockResolvedValue(undefined),
  };
  const ado = { getIterations: jest.fn().mockResolvedValue([]), getCapacityDays: jest.fn().mockResolvedValue([]), createWorkItem: jest.fn() };
  const mapper = { toTicket: jest.fn() };
  const sync = { syncInitial: jest.fn() };
  const writeback = { enqueue: jest.fn() };
  const service = new SessionsService(
    prisma as any,
    redis as any,
    capacities as any,
    memberMeta as any,
    ado as any,
    mapper as any,
    sync as any,
    writeback as any,
  );
  return { service, prisma, redis, capacities, memberMeta, ado, mapper, sync, writeback };
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
    // Les chemins d'itération déjà résolus sont transmis (pas de getIterations redondant).
    expect(sync.syncInitial).toHaveBeenCalledWith("s1", "orgX", "p1", ["it1"], "token", undefined, ["P\\S1"]);
  });

  it("amorce en base les capacités ADO des itérations à venir, sans écraser l'existant", async () => {
    const { service, prisma, capacities, ado, sync } = makeService();
    ado.getIterations.mockResolvedValue([
      { id: "past", name: "S0", path: "P\\S0", startDate: "2020-01-06", finishDate: "2020-01-17" },
      { id: "next", name: "S1", path: "P\\S1", startDate: "2199-01-04", finishDate: "2199-01-15" },
    ]);
    prisma.planningSession.create.mockResolvedValue({ id: "s1" });
    sync.syncInitial.mockResolvedValue({ tickets: [], teamMembers: [{ id: "alice@x", displayName: "Alice", capacityHoursPerDay: 8 }] });
    ado.getCapacityDays.mockResolvedValue([{ memberId: "alice@x", days: 8 }]);
    capacities.list.mockResolvedValue([{ memberId: "alice@x", iterationPath: "P\\S1", storyPoints: 8 }]);

    const snapshot = await service.createSession({ adoProjectId: "p1" }, "u1", "orgX", "token");

    expect(ado.getCapacityDays).toHaveBeenCalledTimes(1); // le sprint passé est ignoré
    expect(ado.getCapacityDays).toHaveBeenCalledWith("orgX", "p1", "next", "2199-01-04", "2199-01-15", "token");
    // seed en base (skipDuplicates côté repo) puis relecture remappée sur l'équipe
    expect(capacities.seed).toHaveBeenCalledWith("p1", [{ memberId: "alice@x", iterationPath: "P\\S1", storyPoints: 8 }]);
    expect(snapshot.capacities).toEqual([{ memberId: "alice@x", iterationPath: "P\\S1", storyPoints: 8 }]);
  });

  it("ignore les erreurs ADO au seed (capacité non configurée)", async () => {
    const { service, prisma, capacities, ado, sync } = makeService();
    ado.getIterations.mockResolvedValue([
      { id: "next", name: "S1", path: "P\\S1", startDate: "2199-01-04", finishDate: "2199-01-15" },
    ]);
    prisma.planningSession.create.mockResolvedValue({ id: "s1" });
    sync.syncInitial.mockResolvedValue({ tickets: [], teamMembers: [] });
    ado.getCapacityDays.mockRejectedValue(new Error("404"));

    const snapshot = await service.createSession({ adoProjectId: "p1" }, "u1", "orgX", "token");

    expect(snapshot.capacities).toEqual([]);
    expect(capacities.seed).toHaveBeenCalledWith("p1", []);
  });
});

describe("SessionsService.setCapacity", () => {
  it("délègue au repo (persistance par projet ADO) et renvoie l'état remappé", async () => {
    const { service, prisma, capacities, redis } = makeService();
    prisma.planningSession.findUniqueOrThrow.mockResolvedValue({ id: "s1", adoProjectId: "p1" });
    redis.getTeamMembers.mockResolvedValue([{ id: "m1", displayName: "A", capacityHoursPerDay: 8 }]);
    capacities.list.mockResolvedValue([{ memberId: "m1", iterationPath: "S1", storyPoints: 0 }]);

    const cap = { memberId: "m1", iterationPath: "S1", storyPoints: 0 };
    const res = await service.setCapacity("s1", cap);

    expect(capacities.set).toHaveBeenCalledWith("p1", cap);
    expect(capacities.list).toHaveBeenCalledWith("p1", [{ id: "m1", displayName: "A", capacityHoursPerDay: 8 }]);
    expect(res).toEqual([{ memberId: "m1", iterationPath: "S1", storyPoints: 0 }]);
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

  it("n'enfile PAS le write-back quand WRITEBACK_ENABLED=false", async () => {
    const { service, redis, prisma, writeback } = makeService();
    redis.getTicket.mockResolvedValue({ ...ticket });
    redis.updateTicket.mockResolvedValue(undefined);
    prisma.operationsLog.create.mockResolvedValue({ id: "log1" });

    const prev = process.env.WRITEBACK_ENABLED;
    process.env.WRITEBACK_ENABLED = "false";
    try {
      const op: Operation = {
        ticketId: "t1",
        field: "assigneeId",
        value: "m2",
        userId: "u1",
        clientTimestamp: 1,
      };
      const result = await service.applyOperation("s1", op);

      expect(result.assigneeId).toBe("m2");
      expect(prisma.operationsLog.create).toHaveBeenCalled();
      expect(writeback.enqueue).not.toHaveBeenCalled();
    } finally {
      process.env.WRITEBACK_ENABLED = prev;
    }
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
    const { service, redis, prisma } = makeService();
    redis.getTickets.mockResolvedValue([ticket]);
    redis.getPresences.mockResolvedValue([{ userId: "u1" }]);
    prisma.planningSession.findUnique.mockResolvedValue({ id: "s1", adoOrg: "orgX", adoProjectId: "p1" });

    const snapshot = await service.getSnapshot("s1");

    expect(snapshot).toEqual({
      sessionId: "s1",
      tickets: [ticket],
      participants: [{ userId: "u1" }],
      teamMembers: [],  // mock retourne [] par défaut
      iterations: [],
      capacities: [],
      memberMeta: [],
      states: [],
      adoUrl: "https://dev.azure.com/orgX/p1",
    });
  });
});

describe("SessionsService.duplicateTicket", () => {
  it("crée le work item copié dans ADO (titre + ' - Copy', même parent) et l'ajoute à la session", async () => {
    const { service, redis, prisma, ado, mapper } = makeService();
    const src = { ...ticket, title: "T - Copy", parentId: "f1", tags: ["a", "b"], epicId: "e1", epicTitle: "Epic" };
    redis.getTicket.mockResolvedValue(src);
    prisma.planningSession.findUnique.mockResolvedValue({ id: "s1", adoOrg: "orgX", adoProjectId: "p1" });
    ado.createWorkItem.mockResolvedValue({ id: 42, rev: 1, fields: {} });
    mapper.toTicket.mockReturnValue({ ...src, id: "42", parentId: null, epicId: null, epicTitle: null });

    const created = await service.duplicateTicket("s1", "t1", "token");

    const [org, project, type, patches] = ado.createWorkItem.mock.calls[0];
    expect([org, project, type]).toEqual(["orgX", "p1", "User Story"]);
    // Un « - Copy » est toujours ajouté, même si le titre en a déjà un.
    expect(patches).toContainEqual({ op: "add", path: "/fields/System.Title", value: "T - Copy - Copy" });
    expect(patches).toContainEqual({ op: "add", path: "/fields/System.Tags", value: "a; b" });
    expect(patches).toContainEqual(
      expect.objectContaining({ path: "/relations/-", value: expect.objectContaining({ rel: "System.LinkTypes.Hierarchy-Reverse" }) }),
    );
    // Champs dérivés recopiés de la source, ticket persisté dans la session.
    expect(created).toMatchObject({ id: "42", parentId: "f1", epicId: "e1", epicTitle: "Epic" });
    expect(redis.updateTicket).toHaveBeenCalledWith("s1", created);
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
