import { AdoWebhookService } from "./ado-webhook.service";

function makeService() {
  const prisma = {
    ticketsCache: { findMany: jest.fn() },
  };
  const redis = {
    clearSyncSlot: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AdoWebhookService(prisma as any, redis as any);
  return { service, prisma, redis };
}

describe("AdoWebhookService.handleWorkItemUpdated — invalidation sans appel ADO", () => {
  it("ne fait rien si aucune session ne contient le ticket", async () => {
    const { service, prisma, redis } = makeService();
    prisma.ticketsCache.findMany.mockResolvedValue([]);

    await service.handleWorkItemUpdated("125");

    expect(redis.clearSyncSlot).not.toHaveBeenCalled();
  });

  it("invalide le créneau de sync de chaque session contenant le ticket", async () => {
    const { service, prisma, redis } = makeService();
    prisma.ticketsCache.findMany.mockResolvedValue([
      { sessionId: "s1" },
      { sessionId: "s2" },
    ]);

    await service.handleWorkItemUpdated("125");

    expect(redis.clearSyncSlot).toHaveBeenCalledWith("s1");
    expect(redis.clearSyncSlot).toHaveBeenCalledWith("s2");
  });

  it("déduplique les sessions si le même ticket apparaît plusieurs fois", async () => {
    const { service, prisma, redis } = makeService();
    prisma.ticketsCache.findMany.mockResolvedValue([
      { sessionId: "s1" },
      { sessionId: "s1" },
    ]);

    await service.handleWorkItemUpdated("125");

    expect(redis.clearSyncSlot).toHaveBeenCalledTimes(1);
  });
});
