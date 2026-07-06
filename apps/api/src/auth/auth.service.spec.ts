import { AuthService } from "./auth.service";

function makeService() {
  const ado = { getConnectionData: jest.fn() };
  const prisma = { user: { upsert: jest.fn() } };
  const service = new AuthService(ado as any, prisma as any);
  return { service, ado, prisma };
}

describe("AuthService", () => {
  it("loginWithPat valide le PAT contre l'org et upsert l'utilisateur", async () => {
    const { service, ado, prisma } = makeService();
    ado.getConnectionData.mockResolvedValue({ id: "me1", displayName: "Alice" });
    prisma.user.upsert.mockResolvedValue({ id: "u1", displayName: "Alice" });

    const res = await service.loginWithPat("my-pat", "Les-Moires");

    expect(ado.getConnectionData).toHaveBeenCalledWith("Les-Moires", "my-pat");
    expect(res.pat).toBe("my-pat");
    expect(res.org).toBe("Les-Moires");
    expect(res.user).toEqual({ id: "u1", displayName: "Alice" });
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { azureAdId: "me1" } }),
    );
  });

  it("loginWithPat propage l'erreur si le PAT/l'org est invalide", async () => {
    const { service, ado, prisma } = makeService();
    ado.getConnectionData.mockRejectedValue(new Error("Unauthorized"));

    await expect(service.loginWithPat("bad", "org")).rejects.toThrow("Unauthorized");
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });
});
