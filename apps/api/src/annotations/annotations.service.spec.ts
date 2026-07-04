import { AnnotationsService } from "./annotations.service";

const ITERS = [
  { id: "1", name: "S1", path: "P\\S1", startDate: "", finishDate: "" },
  { id: "2", name: "S2", path: "P\\S2", startDate: "", finishDate: "" },
  { id: "3", name: "S3", path: "P\\S3", startDate: "", finishDate: "" },
];

function make() {
  const prisma = {
    planningSession: { findUniqueOrThrow: jest.fn().mockResolvedValue({ adoProjectId: "p1" }) },
    milestone: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn((a) => Promise.resolve({ id: "m", iter: a.data.iter, ...a.data })), update: jest.fn((a) => Promise.resolve({ id: a.where.id, iter: a.data.iter ?? 0, title: "T", color: "#000" })) },
    rowPin: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn((a) => Promise.resolve({ id: "p", iter: a.data.iter, ...a.data })), update: jest.fn((a) => Promise.resolve({ id: a.where.id, iter: a.data.iter ?? 0, rowKey: "epic:E1", title: "T", color: "#000" })) },
  };
  const redis = { getIterations: jest.fn().mockResolvedValue(ITERS) };
  return { prisma, redis, svc: new AnnotationsService(prisma as any, redis as any) };
}

describe("AnnotationsService — persistance par projet & clé d'itération stable", () => {
  it("list interroge par projet résolu depuis la session", async () => {
    const { prisma, svc } = make();
    await svc.list("s1");
    expect(prisma.milestone.findMany).toHaveBeenCalledWith({ where: { adoProjectId: "p1" } });
    expect(prisma.rowPin.findMany).toHaveBeenCalledWith({ where: { adoProjectId: "p1" } });
  });

  it("list recalcule iter depuis le chemin ADO (robuste au réordonnancement)", async () => {
    const { prisma, svc } = make();
    // iter stocké obsolète (0) mais le path pointe sur S3 → index courant 2.
    prisma.milestone.findMany.mockResolvedValue([{ id: "m1", title: "T", iter: 0, iterationPath: "P\\S3", color: "#000" }]);
    prisma.rowPin.findMany.mockResolvedValue([{ id: "p1", rowKey: "epic:E1", title: "F", iter: 0, iterationPath: "P\\S2", color: "#111" }]);
    const { milestones, rowPins } = await svc.list("s1");
    expect(milestones[0].iter).toBe(2);
    expect(rowPins[0].iter).toBe(1);
  });

  it("list retombe sur iter stocké quand le path est absent (legacy) ou introuvable (sprint supprimé)", async () => {
    const { prisma, svc } = make();
    prisma.milestone.findMany.mockResolvedValue([
      { id: "leg", title: "L", iter: 1, iterationPath: null, color: "#000" },       // legacy
      { id: "gone", title: "G", iter: 2, iterationPath: "P\\OLD", color: "#000" },  // sprint disparu
    ]);
    const { milestones } = await svc.list("s1");
    expect(milestones.find((m) => m.id === "leg")!.iter).toBe(1);
    expect(milestones.find((m) => m.id === "gone")!.iter).toBe(2);
  });

  it("createMilestone stocke le projet + le chemin stable de l'itération", async () => {
    const { prisma, svc } = make();
    await svc.createMilestone("s1", { title: "Livraison", iter: 2, color: "#000" });
    expect(prisma.milestone.create).toHaveBeenCalledWith({
      data: { adoProjectId: "p1", iterationPath: "P\\S3", title: "Livraison", iter: 2, color: "#000" },
    });
  });

  it("createRowPin stocke le projet + le chemin stable", async () => {
    const { prisma, svc } = make();
    await svc.createRowPin("s1", { rowKey: "epic:E1", iter: 1, title: "Flag", color: "#E69F00" });
    expect(prisma.rowPin.create).toHaveBeenCalledWith({
      data: { adoProjectId: "p1", iterationPath: "P\\S2", rowKey: "epic:E1", iter: 1, title: "Flag", color: "#E69F00" },
    });
  });

  it("updateMilestone met à jour la clé stable en même temps que l'index", async () => {
    const { prisma, svc } = make();
    await svc.updateMilestone("s1", "m1", { iter: 0 });
    expect(prisma.milestone.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { iter: 0, iterationPath: "P\\S1" } });
  });

  it("updateMilestone sans iter ne touche pas au chemin", async () => {
    const { prisma, svc } = make();
    await svc.updateMilestone("s1", "m1", { title: "X" });
    expect(prisma.milestone.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { title: "X" } });
  });
});
