import { AdoService } from "./ado.service";
import { AdoMapper } from "./ado.mapper";

const service = new AdoService(new AdoMapper());

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
    const res = await service.getProjects("org", "tkn");
    expect(res).toEqual([{ id: "p1", name: "Alpha" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/_apis/projects"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tkn" }),
      }),
    );
  });

  it("getOrganizations résout le profil puis les comptes de l'utilisateur", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ id: "me1", displayName: "Bob" }))
      .mockResolvedValueOnce(ok({ value: [{ accountId: "a1", accountName: "OrgA" }] }));
    const res = await service.getOrganizations("tkn");
    expect(res).toEqual([{ id: "a1", name: "OrgA" }]);
    expect(fetchMock.mock.calls[0][0]).toContain("/profile/profiles/me");
    expect(fetchMock.mock.calls[1][0]).toContain("memberId=me1");
  });

  it("getIterations extrait les dates d'attributs", async () => {
    fetchMock.mockResolvedValue(
      ok({ value: [{ id: "it1", name: "Sprint 1", path: "Proj\\Sprint 1", attributes: { startDate: "s", finishDate: "f" } }] }),
    );
    const res = await service.getIterations("org", "p1", "tkn");
    expect(res[0]).toEqual({ id: "it1", name: "Sprint 1", path: "Proj\\Sprint 1", startDate: "s", finishDate: "f" });
  });

  it("getAreas aplatit l'arbre de classification", async () => {
    fetchMock.mockResolvedValue(
      ok({ name: "Areas", children: [{ name: "Team", children: [{ name: "Sub" }] }] }),
    );
    const res = await service.getAreas("org", "p1", "tkn");
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
    const res = await service.getTeamMembers("org", "p1", "tkn");
    expect(res).toEqual([{ id: "m1", displayName: "Alice", capacityHoursPerDay: 8 }]);
  });

  it("queryWorkItemIds résout les GUID en chemins et construit la WIQL", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ value: [{ id: "it1", name: "Sprint 1", path: "Proj\\Sprint 1" }] }))
      .mockResolvedValueOnce(ok({ workItems: [{ id: 1 }, { id: 2 }] }));
    const res = await service.queryWorkItemIds("org", "p1", ["it1"], "tkn");
    expect(res).toEqual(["1", "2"]);
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.query).toContain("[System.IterationPath] = 'Proj\\Sprint 1'");
  });

  it("getCapacities somme les activités en heures/jour", async () => {
    fetchMock.mockResolvedValue(
      ok({ value: [{ teamMember: { id: "m1", displayName: "Alice" }, activities: [{ capacityPerDay: 4 }, { capacityPerDay: 4 }] }] }),
    );
    const res = await service.getCapacities("org", "p1", "it1", "tkn");
    expect(res[0].capacityHoursPerDay).toBe(8);
  });

  it("resolveEpics remonte la hiérarchie parent jusqu'à l'Epic", async () => {
    // Story 1 -> Feature 10 -> Epic 100. Le batch des parents renvoie 10 puis 100.
    const story = { id: 1, rev: 1, fields: { "System.WorkItemType": "User Story", "System.Title": "Story", "System.Parent": 10 } };
    fetchMock
      .mockResolvedValueOnce(ok({ value: [
        { id: 10, fields: { "System.WorkItemType": "Feature", "System.Title": "Feat", "System.Parent": 100 } },
      ] }))
      .mockResolvedValueOnce(ok({ value: [
        { id: 100, fields: { "System.WorkItemType": "Epic", "System.Title": "Grand Epic" } },
      ] }));

    const map = await service.resolveEpics("org", [story], "tkn");
    expect(map.get("1")).toEqual({ id: "100", title: "Grand Epic" });
  });

  it("resolveEpics ignore les items sans ancêtre Epic", async () => {
    const orphan = { id: 2, rev: 1, fields: { "System.WorkItemType": "Task", "System.Title": "T" } };
    const map = await service.resolveEpics("org", [orphan], "tkn");
    expect(map.has("2")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("patchWorkItem envoie un JSON Patch et renvoie la nouvelle révision", async () => {
    fetchMock.mockResolvedValue(ok({ rev: 7 }));
    const rev = await service.patchWorkItem("org", "42", "endDate", "2026-06-12", 6, "tkn");
    expect(rev).toBe(7);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/workitems/42"),
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("propage une erreur si l'API ADO répond non-OK", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: () => Promise.resolve("denied") });
    await expect(service.getProjects("org", "tkn")).rejects.toThrow("ADO API error: 403");
  });
});
