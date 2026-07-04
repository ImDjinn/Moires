import { BadRequestException } from "@nestjs/common";
import { AnnotationsController } from "./annotations.controller";

function make() {
  const svc = {
    list: jest.fn(),
    createMilestone: jest.fn((_id, d) => Promise.resolve({ id: "x", ...d })),
    updateMilestone: jest.fn(),
    deleteMilestone: jest.fn(),
    createRowPin: jest.fn((_id, d) => Promise.resolve({ id: "p", ...d })),
    updateRowPin: jest.fn(),
    deleteRowPin: jest.fn(),
  };
  return { svc, ctrl: new AnnotationsController(svc as any) };
}

describe("AnnotationsController", () => {
  it("crée un jalon et coerce iter en nombre", async () => {
    const { svc, ctrl } = make();
    await ctrl.createMilestone("s1", { title: "Livraison", iter: "3", color: "#000" });
    expect(svc.createMilestone).toHaveBeenCalledWith("s1", { title: "Livraison", iter: 3, color: "#000" });
  });

  it("rejette un jalon sans titre", () => {
    const { ctrl } = make();
    expect(() => ctrl.createMilestone("s1", { iter: 1, color: "#000" })).toThrow(BadRequestException);
  });

  it("rejette un iter négatif", () => {
    const { ctrl } = make();
    expect(() => ctrl.createMilestone("s1", { title: "T", iter: -1, color: "#000" })).toThrow(BadRequestException);
  });

  it("crée un flag et passe rowKey + champs", async () => {
    const { svc, ctrl } = make();
    await ctrl.createRowPin("s1", { rowKey: "epic:E1", iter: 2, title: "Flag", color: "#E69F00" });
    expect(svc.createRowPin).toHaveBeenCalledWith("s1", { rowKey: "epic:E1", iter: 2, title: "Flag", color: "#E69F00" });
  });

  it("met à jour un flag par id (champs partiels coercés), en passant la session", async () => {
    const { svc, ctrl } = make();
    await ctrl.updateRowPin("s1", "p1", { iter: "4" } as any);
    expect(svc.updateRowPin).toHaveBeenCalledWith("s1", "p1", { iter: 4 });
  });

  it("supprime un flag par id", async () => {
    const { svc, ctrl } = make();
    await ctrl.deleteRowPin("p1");
    expect(svc.deleteRowPin).toHaveBeenCalledWith("p1");
  });
});
