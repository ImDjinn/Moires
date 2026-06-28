jest.mock("bullmq", () => ({
  Worker: jest.fn(),
  Job: class {},
}));

import { WritebackProcessor } from "./writeback.processor";
import type { Operation } from "@moires/shared";

const op: Operation = {
  ticketId: "t1",
  field: "endDate",
  value: "2026-06-20",
  userId: "u1",
  clientTimestamp: 1,
};

const ticket = {
  id: "t1",
  title: "T",
  assigneeId: "m1",
  areaPath: "",
  iterationId: "it1",
  startDate: "2026-06-10",
  endDate: "2026-06-11",
  estimateHours: 8,
  adoRev: 3,
  syncStatus: "pending" as const,
};

function makeProcessor() {
  const config = { get: () => "tok" } as any;
  const prisma = { operationsLog: { update: jest.fn().mockResolvedValue(undefined) } };
  const redis = {
    getTicket: jest.fn(),
    updateTicket: jest.fn().mockResolvedValue(undefined),
  };
  const ado = { patchWorkItem: jest.fn() };
  const processor = new WritebackProcessor(config, prisma as any, redis as any, ado as any);
  return { processor, prisma, redis, ado };
}

// On teste la logique métier directement (process est privé, onModuleInit/Worker non sollicités).
const run = (p: WritebackProcessor, job: any) => (p as any).process(job);

describe("WritebackProcessor.process", () => {
  it("succès : PATCH ADO, met à jour la révision et marque 'synced'", async () => {
    const { processor, prisma, redis, ado } = makeProcessor();
    redis.getTicket.mockResolvedValue({ ...ticket });
    ado.patchWorkItem.mockResolvedValue(4);

    await run(processor, { data: { sessionId: "s1", op, logId: "log1" }, attemptsMade: 0, opts: { attempts: 5 } });

    expect(ado.patchWorkItem).toHaveBeenCalledWith("t1", "endDate", "2026-06-20", 3, "tok");
    expect(redis.updateTicket).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ adoRev: 4, syncStatus: "synced" }),
    );
    expect(prisma.operationsLog.update).toHaveBeenCalledWith({
      where: { id: "log1" },
      data: { adoSyncStatus: "synced" },
    });
  });

  it("échec final : marque 'failed' et passe le ticket en 'error'", async () => {
    const { processor, prisma, redis, ado } = makeProcessor();
    redis.getTicket.mockResolvedValue({ ...ticket });
    ado.patchWorkItem.mockRejectedValue(new Error("boom"));

    // dernière tentative (attemptsMade = attempts - 1)
    await expect(
      run(processor, { data: { sessionId: "s1", op, logId: "log1" }, attemptsMade: 4, opts: { attempts: 5 } }),
    ).rejects.toThrow("boom");

    expect(prisma.operationsLog.update).toHaveBeenCalledWith({
      where: { id: "log1" },
      data: { adoSyncStatus: "failed" },
    });
    expect(redis.updateTicket).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ syncStatus: "error" }),
    );
  });

  it("échec non final : rejette sans marquer 'failed' (retry)", async () => {
    const { processor, prisma, ado, redis } = makeProcessor();
    redis.getTicket.mockResolvedValue({ ...ticket });
    ado.patchWorkItem.mockRejectedValue(new Error("transient"));

    await expect(
      run(processor, { data: { sessionId: "s1", op, logId: "log1" }, attemptsMade: 1, opts: { attempts: 5 } }),
    ).rejects.toThrow("transient");

    expect(prisma.operationsLog.update).not.toHaveBeenCalled();
  });
});
