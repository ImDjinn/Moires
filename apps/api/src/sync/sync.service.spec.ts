import { SyncService } from "./sync.service";
import { AdoMapper, RawAdoWorkItem } from "../ado/ado.mapper";

const raw: RawAdoWorkItem = {
  id: 1,
  rev: 2,
  fields: {
    "System.Title": "T",
    "System.IterationId": "it1",
    "Microsoft.VSTS.Scheduling.StartDate": "2026-06-10",
    "Microsoft.VSTS.Scheduling.FinishDate": "2026-06-11",
    "Microsoft.VSTS.Scheduling.OriginalEstimate": 8,
  },
};

function makeService() {
  const prisma = {
    ticketsCache: { upsert: jest.fn().mockResolvedValue(undefined) },
    planningSession: { findUniqueOrThrow: jest.fn() },
  };
  const redis = {
    setTickets: jest.fn().mockResolvedValue(undefined),
    getPresences: jest.fn().mockResolvedValue([]),
    getIterations: jest.fn().mockResolvedValue([]),
    getStates: jest.fn().mockResolvedValue([]),
    setStates: jest.fn().mockResolvedValue(undefined),
  };
  const capacities = { list: jest.fn().mockResolvedValue([]) };
  const ado = {
    queryWorkItemIds: jest.fn(),
    getWorkItemsBatch: jest.fn(),
    getCapacities: jest.fn(),
    getTeamMembers: jest.fn().mockResolvedValue([]),
    resolveEpics: jest.fn().mockResolvedValue(new Map()),
    getStates: jest.fn().mockResolvedValue([]),
    getBacklogTypes: jest.fn().mockResolvedValue([]),
    getBoardColumns: jest.fn().mockResolvedValue([]),
  };
  const service = new SyncService(prisma as any, redis as any, capacities as any, ado as any, new AdoMapper());
  return { service, prisma, redis, capacities, ado };
}

describe("SyncService.syncInitial", () => {
  it("interroge ADO, mappe, met en cache Redis + Postgres", async () => {
    const { service, prisma, redis, ado } = makeService();
    ado.queryWorkItemIds.mockResolvedValue(["1"]);
    ado.getWorkItemsBatch.mockResolvedValue([raw]);
    ado.getCapacities.mockResolvedValue([{ id: "m1", displayName: "Alice", capacityHoursPerDay: 8 }]);

    const res = await service.syncInitial("s1", "org1", "p1", ["it1"], "tkn");

    expect(res.tickets).toHaveLength(1);
    expect(res.tickets[0].id).toBe("1");
    expect(res.teamMembers).toHaveLength(1);
    expect(redis.setTickets).toHaveBeenCalledWith("s1", res.tickets);
    expect(prisma.ticketsCache.upsert).toHaveBeenCalledTimes(1);
  });

  it("enrichit les tickets avec l'Epic résolu", async () => {
    const { service, ado } = makeService();
    ado.queryWorkItemIds.mockResolvedValue(["1"]);
    ado.getWorkItemsBatch.mockResolvedValue([raw]);
    ado.getCapacities.mockResolvedValue([]);
    ado.resolveEpics.mockResolvedValue(new Map([["1", { id: "100", title: "Epic A" }]]));

    const res = await service.syncInitial("s1", "org1", "p1", ["it1"], "tkn");

    expect(res.tickets[0].epicId).toBe("100");
    expect(res.tickets[0].epicTitle).toBe("Epic A");
  });

  it("ne charge pas de work items quand la requête ne renvoie aucun id", async () => {
    const { service, ado } = makeService();
    ado.queryWorkItemIds.mockResolvedValue([]);
    ado.getCapacities.mockResolvedValue([]);

    const res = await service.syncInitial("s1", "org1", "p1", ["it1"], "tkn");

    expect(res.tickets).toEqual([]);
    expect(ado.getWorkItemsBatch).not.toHaveBeenCalled();
  });
});

describe("SyncService.syncIncremental", () => {
  it("recharge depuis la session persistée et renvoie un snapshot", async () => {
    const { service, prisma, capacities, ado } = makeService();
    prisma.planningSession.findUniqueOrThrow.mockResolvedValue({
      id: "s1",
      adoOrg: "org1",
      adoProjectId: "p1",
      adoIterationIds: ["it1"],
      areaPaths: [],
    });
    ado.queryWorkItemIds.mockResolvedValue(["1"]);
    ado.getWorkItemsBatch.mockResolvedValue([raw]);
    ado.getCapacities.mockResolvedValue([]);

    const snapshot = await service.syncIncremental("s1", "tkn");

    expect(snapshot.sessionId).toBe("s1");
    expect(snapshot.tickets).toHaveLength(1);
    expect(snapshot.participants).toEqual([]);
    // capacités lues en base par projet (persistantes hors session)
    expect(capacities.list).toHaveBeenCalledWith("p1", []);
  });
});
