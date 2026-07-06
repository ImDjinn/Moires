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
  it("getProjects mappe id/name et envoie le PAT en Basic auth", async () => {
    fetchMock.mockResolvedValue(ok({ value: [{ id: "p1", name: "Alpha", extra: 1 }] }));
    const res = await service.getProjects("org", "tkn");
    expect(res).toEqual([{ id: "p1", name: "Alpha" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/_apis/projects"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from(":tkn").toString("base64")}`,
        }),
      }),
    );
  });

  it("getConnectionData valide le PAT contre l'org et renvoie l'identité", async () => {
    fetchMock.mockResolvedValue(ok({ authenticatedUser: { id: "me1", providerDisplayName: "Bob" } }));
    const res = await service.getConnectionData("org", "tkn");
    expect(res).toEqual({ id: "me1", displayName: "Bob" });
    expect(fetchMock.mock.calls[0][0]).toContain("/org/_apis/connectionData");
    // connectionData est un endpoint preview : la version DOIT porter -preview.
    expect(fetchMock.mock.calls[0][0]).toContain("api-version=7.1-preview");
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

  it("getCapacityDays calcule jours ouvrés − jours off (équipe + membre)", async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes("teamdaysoff")
          ? ok({ daysOff: [{ start: "2026-07-14T00:00:00Z", end: "2026-07-14T00:00:00Z" }] })
          : ok({
              value: [
                { teamMember: { uniqueName: "alice@x", id: "m1", displayName: "Alice" }, daysOff: [{ start: "2026-07-09T00:00:00Z", end: "2026-07-10T00:00:00Z" }] },
                { teamMember: { id: "m2", displayName: "Bob" }, daysOff: [] },
              ],
            }),
      ),
    );
    // Itération lun 06/07 → ven 17/07 : 10 jours ouvrés ; 1 jour off équipe (mar 14).
    const res = await service.getCapacityDays("org", "p1", "it1", "2026-07-06T00:00:00Z", "2026-07-17T00:00:00Z", "tkn");
    expect(res).toEqual([
      { memberId: "alice@x", days: 7 }, // 10 − 1 équipe − 2 perso (jeu 09–ven 10)
      { memberId: "m2", days: 9 },
    ]);
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

  it("getTypeFields filtre System.*, WEF_* et les champs déjà mappés, et remonte défaut + contraintes", async () => {
    fetchMock.mockResolvedValue(
      ok({ value: [
        { referenceName: "System.Title", name: "Title" },
        { referenceName: "WEF_ABC_Kanban.Column", name: "Board Column" },
        { referenceName: "Microsoft.VSTS.Scheduling.StoryPoints", name: "Story Points" },
        { referenceName: "Custom.WorkType", name: "Work Type", defaultValue: "Implementation", alwaysRequired: true, allowedValues: ["Implementation", "Design"] },
        { referenceName: "Custom.Risque", name: "Risque", defaultValue: { odd: true } },
      ] }),
    );
    const res = await service.getTypeFields("org", "p1", "User Story", "tkn");
    expect(res).toEqual([
      { referenceName: "Custom.WorkType", name: "Work Type", defaultValue: "Implementation", alwaysRequired: true, allowedValues: ["Implementation", "Design"] },
      { referenceName: "Custom.Risque", name: "Risque", defaultValue: null, alwaysRequired: false, allowedValues: [] },
    ]);
    expect(fetchMock.mock.calls[0][0]).toContain("/workitemtypes/User%20Story/fields");
    expect(fetchMock.mock.calls[0][0]).toContain("$expand=allowedValues");
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
