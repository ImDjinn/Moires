import { AdoWebhookService } from "./ado-webhook.service";

const ticket = {
  id: "125",
  title: "Fix bug",
  assigneeId: "u1",
  areaPath: "Proj",
  iterationId: "it1",
  epicId: null,
  epicTitle: null,
  workItemType: "User Story",
  parentId: null,
  state: "New",
  tags: [],
  targetDate: null,
  startDate: "2026-06-01",
  endDate: "2026-06-14",
  estimateHours: 8,
  storyPoints: 3,
  adoRev: 5,
  syncStatus: "synced" as const,
};

function makeService() {
  const prisma = {
    ticketsCache: {
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    },
  };
  const redis = {
    getSessionToken: jest.fn(),
    updateTicket: jest.fn().mockResolvedValue(undefined),
  };
  const ado = { getWorkItemsBatch: jest.fn() };
  const mapper = { toTicket: jest.fn().mockReturnValue({ ...ticket }) };
  const broadcast = { send: jest.fn() };
  const service = new AdoWebhookService(
    prisma as any,
    redis as any,
    ado as any,
    mapper as any,
    broadcast as any,
  );
  return { service, prisma, redis, ado, mapper, broadcast };
}

describe("AdoWebhookService.handleWorkItemUpdated", () => {
  it("ne fait rien si aucune session contient le ticket", async () => {
    const { service, prisma, ado } = makeService();
    prisma.ticketsCache.findMany.mockResolvedValue([]);

    await service.handleWorkItemUpdated("125", "myorg");

    expect(ado.getWorkItemsBatch).not.toHaveBeenCalled();
  });

  it("re-fetche le ticket, met à jour Redis et broadcast ticket:updated", async () => {
    const { service, prisma, redis, ado, broadcast } = makeService();
    prisma.ticketsCache.findMany.mockResolvedValue([{ sessionId: "s1" }]);
    redis.getSessionToken.mockResolvedValue("tok");
    ado.getWorkItemsBatch.mockResolvedValue([{}]);

    await service.handleWorkItemUpdated("125", "myorg");

    expect(ado.getWorkItemsBatch).toHaveBeenCalledWith("myorg", ["125"], "tok");
    expect(redis.updateTicket).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ id: "125", syncStatus: "synced" }),
    );
    expect(broadcast.send).toHaveBeenCalledWith(
      "s1",
      "ticket:updated",
      expect.objectContaining({ id: "125" }),
    );
  });

  it("ignore une session sans token Redis sans faire échouer les autres", async () => {
    const { service, prisma, redis, ado, broadcast } = makeService();
    prisma.ticketsCache.findMany.mockResolvedValue([
      { sessionId: "s1" },
      { sessionId: "s2" },
    ]);
    redis.getSessionToken
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("tok");
    ado.getWorkItemsBatch.mockResolvedValue([{}]);

    await service.handleWorkItemUpdated("125", "myorg");

    expect(ado.getWorkItemsBatch).toHaveBeenCalledTimes(1);
    expect(broadcast.send).toHaveBeenCalledTimes(1);
    expect(broadcast.send).toHaveBeenCalledWith("s2", "ticket:updated", expect.anything());
  });

  it("déduplique les sessions si le même ticket apparaît plusieurs fois", async () => {
    const { service, prisma, redis, ado } = makeService();
    prisma.ticketsCache.findMany.mockResolvedValue([
      { sessionId: "s1" },
      { sessionId: "s1" },
    ]);
    redis.getSessionToken.mockResolvedValue("tok");
    ado.getWorkItemsBatch.mockResolvedValue([{}]);

    await service.handleWorkItemUpdated("125", "myorg");

    expect(ado.getWorkItemsBatch).toHaveBeenCalledTimes(1);
  });
});
