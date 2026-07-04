jest.mock("bullmq", () => ({
  Worker: jest.fn(),
  Job: class {},
  UnrecoverableError: class UnrecoverableError extends Error {
    constructor(msg?: string) { super(msg); this.name = "UnrecoverableError"; }
  },
}));

import { WritebackProcessor } from "./writeback.processor";
import type { Operation } from "@moirai/shared";

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
  storyPoints: 3,
  adoRev: 3,
  syncStatus: "pending" as const,
};

function makeProcessor() {
  const config = { get: jest.fn().mockReturnValue(undefined) } as any;
  const prisma = {
    planningSession: { findUnique: jest.fn().mockResolvedValue({ id: "s1", adoOrg: "orgX" }) },
    operationsLog: { update: jest.fn().mockResolvedValue(undefined) },
  };
  const redis = {
    getTicket: jest.fn(),
    updateTicket: jest.fn().mockResolvedValue(undefined),
    getUserToken: jest.fn().mockResolvedValue("tok"),
    getStates: jest.fn().mockResolvedValue([]),
  };
  const ado = { patchWorkItem: jest.fn(), patchWorkItemRaw: jest.fn() };
  const broadcast = { send: jest.fn() };
  const processor = new WritebackProcessor(
    config,
    prisma as any,
    redis as any,
    ado as any,
    broadcast as any,
  );
  return { processor, prisma, redis, ado, broadcast };
}

const run = (p: WritebackProcessor, job: any) => (p as any).process(job);

describe("WritebackProcessor.process", () => {
  it("succès : PATCH ADO, met à jour la révision, marque 'synced' et notifie les clients", async () => {
    const { processor, prisma, redis, ado, broadcast } = makeProcessor();
    redis.getTicket.mockResolvedValue({ ...ticket });
    ado.patchWorkItem.mockResolvedValue(4);

    await run(processor, { data: { sessionId: "s1", op, logId: "log1" }, attemptsMade: 0, opts: { attempts: 5 } });

    expect(ado.patchWorkItem).toHaveBeenCalledWith("orgX", "t1", "endDate", "2026-06-20", 3, "tok");
    expect(redis.updateTicket).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ adoRev: 4, syncStatus: "synced" }),
    );
    expect(prisma.operationsLog.update).toHaveBeenCalledWith({
      where: { id: "log1" },
      data: { adoSyncStatus: "synced" },
    });
    expect(broadcast.send).toHaveBeenCalledWith("s1", "ticket:sync-status", {
      ticketId: "t1",
      syncStatus: "synced",
      adoRev: 4,
    });
  });

  it("utilise ADO_SYSTEM_TOKEN si aucun token utilisateur en Redis", async () => {
    const { processor, redis, ado } = makeProcessor();
    redis.getTicket.mockResolvedValue({ ...ticket });
    redis.getUserToken.mockResolvedValue(null);
    (processor as any).config.get.mockReturnValue("system-tok");
    ado.patchWorkItem.mockResolvedValue(4);

    await run(processor, { data: { sessionId: "s1", op, logId: "log1" }, attemptsMade: 0, opts: { attempts: 5 } });

    expect(ado.patchWorkItem).toHaveBeenCalledWith("orgX", "t1", "endDate", "2026-06-20", 3, "system-tok");
  });

  it("boardColumn : patch du seul champ Kanban WEF (ADO transitionne l'état), met à jour l'état Redis", async () => {
    const { processor, redis, ado } = makeProcessor();
    redis.getTicket.mockResolvedValue({ ...ticket, workItemType: "User Story", state: "New" });
    redis.getStates.mockResolvedValue([
      { name: "Doing", category: "InProgress", color: "#000", type: "User Story", state: "Active", columnField: "WEF_ABC_Kanban.Column" },
    ]);
    ado.patchWorkItemRaw.mockResolvedValue(4);
    const colOp: Operation = { ticketId: "t1", field: "boardColumn", value: "Doing", userId: "u1", clientTimestamp: 1 };

    await run(processor, { data: { sessionId: "s1", op: colOp, logId: "log1" }, attemptsMade: 0, opts: { attempts: 5 } });

    // System.State volontairement absent : l'écrire dans le même patch ferait
    // recalculer la colonne par défaut de l'état et écraserait le déplacement.
    expect(ado.patchWorkItemRaw).toHaveBeenCalledWith(
      "orgX",
      "t1",
      [{ op: "replace", path: "/fields/WEF_ABC_Kanban.Column", value: "Doing" }],
      "tok",
    );
    expect(redis.updateTicket).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ boardColumn: "Doing", state: "Active", adoRev: 4, syncStatus: "synced" }),
    );
  });

  it("boardColumn sans mapping (type/colonne inconnus) : rejette", async () => {
    const { processor, redis, ado } = makeProcessor();
    redis.getTicket.mockResolvedValue({ ...ticket, workItemType: "Bug", state: "New" });
    const colOp: Operation = { ticketId: "t1", field: "boardColumn", value: "Doing", userId: "u1", clientTimestamp: 1 };

    await expect(
      run(processor, { data: { sessionId: "s1", op: colOp, logId: "log1" }, attemptsMade: 1, opts: { attempts: 5 } }),
    ).rejects.toThrow(/sans mapping/);
    expect(ado.patchWorkItemRaw).not.toHaveBeenCalled();
  });

  it("échec final : marque 'failed', passe le ticket en 'error' et notifie les clients", async () => {
    const { processor, prisma, redis, ado, broadcast } = makeProcessor();
    redis.getTicket.mockResolvedValue({ ...ticket });
    ado.patchWorkItem.mockRejectedValue(new Error("boom"));

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
    expect(broadcast.send).toHaveBeenCalledWith(
      "s1",
      "ticket:updated",
      expect.objectContaining({ id: "t1", syncStatus: "error" }),
    );
  });

  it("erreur de validation ADO (400) : échec immédiat sans retry, même en première tentative", async () => {
    const { processor, prisma, redis, ado, broadcast } = makeProcessor();
    redis.getTicket.mockResolvedValue({ ...ticket });
    ado.patchWorkItem.mockRejectedValue(new Error("ADO API error: 400 RuleValidationException: champ requis"));

    await expect(
      run(processor, { data: { sessionId: "s1", op, logId: "log1" }, attemptsMade: 0, opts: { attempts: 5 } }),
    ).rejects.toMatchObject({ name: "UnrecoverableError" });

    expect(prisma.operationsLog.update).toHaveBeenCalledWith({
      where: { id: "log1" },
      data: { adoSyncStatus: "failed" },
    });
    expect(broadcast.send).toHaveBeenCalledWith(
      "s1",
      "ticket:updated",
      expect.objectContaining({ id: "t1", syncStatus: "error" }),
    );
  });

  it("échec non final : rejette sans marquer 'failed' ni notifier (retry)", async () => {
    const { processor, prisma, ado, redis, broadcast } = makeProcessor();
    redis.getTicket.mockResolvedValue({ ...ticket });
    ado.patchWorkItem.mockRejectedValue(new Error("transient"));

    await expect(
      run(processor, { data: { sessionId: "s1", op, logId: "log1" }, attemptsMade: 1, opts: { attempts: 5 } }),
    ).rejects.toThrow("transient");

    expect(prisma.operationsLog.update).not.toHaveBeenCalled();
    expect(broadcast.send).not.toHaveBeenCalled();
  });
});
