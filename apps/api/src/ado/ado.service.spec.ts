import { AdoService } from "./ado.service";
import { AdoMapper } from "./ado.mapper";

const config = { get: () => "https://dev.azure.com/org" } as any;
const service = new AdoService(config, new AdoMapper());

function ok(body: unknown) {
  return { ok: true, json: () => Promise.resolve(body), text: () => Promise.resolve("") };
}

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (global as any).fetch = fetchMock;
});

describe("AdoService", () => {
  it("getProjects mappe id/name et envoie le bearer token", async () => {
    fetchMock.mockResolvedValue(ok({ value: [{ id: "p1", name: "Alpha", extra: 1 }] }));
    const res = await service.getProjects("tkn");
    expect(res).toEqual([{ id: "p1", name: "Alpha" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/_apis/projects"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tkn" }),
      }),
    );
  });

  it("getIterations extrait les dates d'attributs", async () => {
    fetchMock.mockResolvedValue(
      ok({ value: [{ id: "it1", name: "Sprint 1", attributes: { startDate: "s", finishDate: "f" } }] }),
    );
    const res = await service.getIterations("p1", "tkn");
    expect(res[0]).toEqual({ id: "it1", name: "Sprint 1", startDate: "s", finishDate: "f" });
  });

  it("getAreas aplatit l'arbre de classification", async () => {
    fetchMock.mockResolvedValue(
      ok({ name: "Areas", children: [{ name: "Team", children: [{ name: "Sub" }] }] }),
    );
    const res = await service.getAreas("p1", "tkn");
    expect(res).toEqual([
      { path: "Areas" },
      { path: "Areas\\Team" },
      { path: "Areas\\Team\\Sub" },
    ]);
  });

  it("getTeamMembers résout l'équipe puis ses membres", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ value: [{ id: "team1" }] }))
      .mockResolvedValueOnce(ok({ value: [{ identity: { id: "m1", displayName: "Alice" } }] }));
    const res = await service.getTeamMembers("p1", "tkn");
    expect(res).toEqual([{ id: "m1", displayName: "Alice", capacityHoursPerDay: 8 }]);
  });

  it("queryWorkItemIds construit la WIQL et renvoie les ids", async () => {
    fetchMock.mockResolvedValue(ok({ workItems: [{ id: 1 }, { id: 2 }] }));
    const res = await service.queryWorkItemIds("p1", ["it1"], "tkn");
    expect(res).toEqual(["1", "2"]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.query).toContain("[System.IterationId] = 'it1'");
  });

  it("getCapacities somme les activités en heures/jour", async () => {
    fetchMock.mockResolvedValue(
      ok({ value: [{ teamMember: { id: "m1", displayName: "Alice" }, activities: [{ capacityPerDay: 4 }, { capacityPerDay: 4 }] }] }),
    );
    const res = await service.getCapacities("p1", "it1", "tkn");
    expect(res[0].capacityHoursPerDay).toBe(8);
  });

  it("patchWorkItem envoie un JSON Patch et renvoie la nouvelle révision", async () => {
    fetchMock.mockResolvedValue(ok({ rev: 7 }));
    const rev = await service.patchWorkItem("42", "endDate", "2026-06-12", 6, "tkn");
    expect(rev).toBe(7);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/workitems/42"),
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("propage une erreur si l'API ADO répond non-OK", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: () => Promise.resolve("denied") });
    await expect(service.getProjects("tkn")).rejects.toThrow("ADO API error: 403");
  });
});
