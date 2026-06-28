const getAuthCodeUrl = jest.fn();
const acquireTokenByCode = jest.fn();
const acquireTokenSilent = jest.fn();

jest.mock("@azure/msal-node", () => ({
  ConfidentialClientApplication: jest.fn().mockImplementation(() => ({
    getAuthCodeUrl,
    acquireTokenByCode,
    acquireTokenSilent,
  })),
}));

import { AuthService } from "./auth.service";

const config = { get: (k: string) => `cfg-${k}` } as any;

function makeService() {
  const prisma = { user: { upsert: jest.fn() } };
  const service = new AuthService(config, prisma as any);
  return { service, prisma };
}

beforeEach(() => {
  getAuthCodeUrl.mockReset();
  acquireTokenByCode.mockReset();
  acquireTokenSilent.mockReset();
});

describe("AuthService", () => {
  it("getLoginUrl délègue à MSAL", async () => {
    getAuthCodeUrl.mockResolvedValue("https://login.microsoftonline.com/authorize");
    const { service } = makeService();
    await expect(service.getLoginUrl()).resolves.toContain("login.microsoftonline.com");
  });

  it("handleCallback échange le code et upsert l'utilisateur", async () => {
    acquireTokenByCode.mockResolvedValue({
      idTokenClaims: { oid: "oid1", name: "Alice", preferred_username: "alice@corp" },
      accessToken: "AT",
    });
    const { service, prisma } = makeService();
    prisma.user.upsert.mockResolvedValue({ id: "u1", displayName: "Alice" });

    const res = await service.handleCallback("code123");

    expect(res.accessToken).toBe("AT");
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { azureAdId: "oid1" } }),
    );
  });

  it("handleCallback lève si MSAL échoue", async () => {
    acquireTokenByCode.mockResolvedValue(null);
    const { service } = makeService();
    await expect(service.handleCallback("bad")).rejects.toThrow("MSAL authentication failed");
  });

  it("refreshToken renvoie le nouveau token", async () => {
    acquireTokenSilent.mockResolvedValue({ accessToken: "NEW" });
    const { service } = makeService();
    await expect(service.refreshToken("old")).resolves.toBe("NEW");
  });
});
