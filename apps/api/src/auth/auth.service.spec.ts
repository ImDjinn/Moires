import { AuthService } from "./auth.service";

function makeService() {
  const ado = { getProfile: jest.fn() };
  const prisma = { user: { upsert: jest.fn() } };
  const service = new AuthService(ado as any, prisma as any);
  return { service, ado, prisma };
}

describe("AuthService", () => {
  it("loginWithPat valide le PAT via le profil et upsert l'utilisateur", async () => {
    const { service, ado, prisma } = makeService();
    ado.getProfile.mockResolvedValue({ id: "me1", displayName: "Alice", email: "alice@corp" });
    prisma.user.upsert.mockResolvedValue({ id: "u1", displayName: "Alice" });

    const res = await service.loginWithPat("my-pat");

    expect(ado.getProfile).toHaveBeenCalledWith("my-pat");
    expect(res.pat).toBe("my-pat");
    expect(res.user).toEqual({ id: "u1", displayName: "Alice" });
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { azureAdId: "me1" } }),
    );
  });

  it("loginWithPat propage l'erreur si le PAT est invalide", async () => {
    const { service, ado, prisma } = makeService();
    ado.getProfile.mockRejectedValue(new Error("Unauthorized"));

    await expect(service.loginWithPat("bad")).rejects.toThrow("Unauthorized");
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });
});
