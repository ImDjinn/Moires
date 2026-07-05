import { describe, it, expect, beforeEach, vi } from "vitest";
import { api } from "./rest.client";

function mockFetch(impl: () => Partial<Response>) {
  global.fetch = vi.fn().mockResolvedValue(impl()) as unknown as typeof fetch;
}

beforeEach(() => vi.restoreAllMocks());

describe("rest.client", () => {
  it("parse le JSON d'une réponse OK et envoie les credentials", async () => {
    mockFetch(() => ({ ok: true, status: 200, json: () => Promise.resolve([{ id: "p1", name: "P" }]) }));
    const projects = await api.getProjects();
    expect(projects).toEqual([{ id: "p1", name: "P" }]);
    expect(global.fetch).toHaveBeenCalledWith(
      "/ado/projects",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("renvoie undefined sur un 204", async () => {
    mockFetch(() => ({ ok: true, status: 204, json: () => Promise.reject(new Error("no body")) }));
    await expect(api.logout()).resolves.toBeUndefined();
  });

  it("lève une erreur sur une réponse non OK", async () => {
    mockFetch(() => ({ ok: false, status: 404, statusText: "Not Found", json: () => Promise.resolve(null) }));
    await expect(api.getProjects()).rejects.toThrow("404 Not Found");
  });

  it("sur 401 : efface la session et rejette (PAT invalide, pas de refresh)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, status: 204 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(api.getProjects()).rejects.toThrow("Session Azure DevOps expirée");
    expect(fetchMock.mock.calls[1][0]).toBe("/auth/logout");
  });

  it("POST /sessions envoie le corps sérialisé", async () => {
    mockFetch(() => ({ ok: true, status: 200, json: () => Promise.resolve({ sessionId: "s1" }) }));
    await api.createSession({ adoProjectId: "p1", adoIterationIds: ["it1"] });
    expect(global.fetch).toHaveBeenCalledWith(
      "/sessions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ adoProjectId: "p1", adoIterationIds: ["it1"] }),
      }),
    );
  });
});
