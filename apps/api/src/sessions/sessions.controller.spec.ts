import { BadRequestException } from "@nestjs/common";
import { SessionsController } from "./sessions.controller";

function make() {
  const sessions = {
    setCapacity: jest.fn().mockResolvedValue([]),
    setMemberMeta: jest.fn().mockResolvedValue([]),
    createSession: jest.fn().mockResolvedValue({}),
  };
  const redis = { getUserPat: jest.fn().mockResolvedValue("tok") };
  return { sessions, ctrl: new SessionsController(sessions as any, {} as any, redis as any) };
}

const user = { id: "u1", displayName: "U", exp: Date.now() + 1000 };
const req = { signedCookies: { ado_org: "orgX" } } as any;

describe("SessionsController — validation des corps de requête", () => {
  it("accepte une capacité bien formée", async () => {
    const { sessions, ctrl } = make();
    await ctrl.setCapacity("s1", { memberId: "m1", iterationPath: "P\\It 1", storyPoints: 8 });
    expect(sessions.setCapacity).toHaveBeenCalledWith("s1", { memberId: "m1", iterationPath: "P\\It 1", storyPoints: 8 });
  });

  it("accepte une capacité négative (convention de suppression)", async () => {
    const { sessions, ctrl } = make();
    await ctrl.setCapacity("s1", { memberId: "m1", iterationPath: "P\\It 1", storyPoints: -1 });
    expect(sessions.setCapacity).toHaveBeenCalledWith("s1", expect.objectContaining({ storyPoints: -1 }));
  });

  it("rejette une capacité non numérique ou hors bornes au lieu de remonter en 500 Prisma", () => {
    const { sessions, ctrl } = make();
    for (const bad of ["8" as any, null as any, NaN, Infinity, 1e308, -2]) {
      expect(() => ctrl.setCapacity("s1", { memberId: "m1", iterationPath: "P", storyPoints: bad })).toThrow(BadRequestException);
    }
    expect(sessions.setCapacity).not.toHaveBeenCalled();
  });

  it("rejette un poste/rôle au-delà du plafond, accepte le vide (effacement)", async () => {
    const { sessions, ctrl } = make();
    expect(() => ctrl.setMemberMeta("s1", { memberId: "m1", poste: "x".repeat(101), role: "" })).toThrow(BadRequestException);
    await ctrl.setMemberMeta("s1", { memberId: "m1", poste: "", role: "" });
    expect(sessions.setMemberMeta).toHaveBeenCalledWith("s1", { memberId: "m1", poste: "", role: "" });
  });

  it("rejette des areaPaths qui ne sont pas un tableau de chaînes", async () => {
    const { ctrl } = make();
    // Sans garde, le `.map()` du service ferait un 500 au lieu d'un 400.
    await expect(ctrl.create({ adoProjectId: "p1", areaPaths: "nope" as any }, req, user)).rejects.toThrow(BadRequestException);
    await expect(ctrl.create({ adoProjectId: "", areaPaths: [] }, req, user)).rejects.toThrow(BadRequestException);
  });

  it("laisse passer une création valide (areaPaths absent)", async () => {
    const { sessions, ctrl } = make();
    await ctrl.create({ adoProjectId: "p1" }, req, user);
    expect(sessions.createSession).toHaveBeenCalledWith({ adoProjectId: "p1", areaPaths: undefined }, "u1", "orgX", "tok");
  });
});
