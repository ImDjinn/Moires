import { AdoMapper, RawAdoWorkItem } from "./ado.mapper";

describe("AdoMapper", () => {
  const mapper = new AdoMapper();

  const raw: RawAdoWorkItem = {
    id: 42,
    rev: 3,
    fields: {
      "System.Title": "Faire X",
      "System.AssignedTo": { uniqueName: "alice@corp.com", id: "aid" },
      "System.AreaPath": "Proj\\Team",
      "System.IterationId": 5,
      "Microsoft.VSTS.Scheduling.StartDate": "2026-06-10T00:00:00Z",
      "Microsoft.VSTS.Scheduling.FinishDate": "2026-06-12T00:00:00Z",
      "Microsoft.VSTS.Scheduling.OriginalEstimate": 16,
      "Microsoft.VSTS.Scheduling.StoryPoints": 5,
    },
  };

  describe("toTicket", () => {
    it("mappe les champs ADO vers un Ticket", () => {
      expect(mapper.toTicket(raw)).toEqual({
        id: "42",
        title: "Faire X",
        workItemType: "",
        parentId: null,
        state: "",
        boardColumn: null,
        tags: [],
        assigneeId: "alice@corp.com",
        areaPath: "Proj\\Team",
        iterationId: "5",
        epicId: null,
        epicTitle: null,
        startDate: "2026-06-10T00:00:00Z",
        endDate: "2026-06-12T00:00:00Z",
        targetDate: null,
        estimateHours: 16,
        storyPoints: 5,
        adoRev: 3,
        syncStatus: "synced",
      });
    });

    it("retombe sur l'id si uniqueName absent", () => {
      const t = mapper.toTicket({
        ...raw,
        fields: { ...raw.fields, "System.AssignedTo": { id: "only-id" } },
      });
      expect(t.assigneeId).toBe("only-id");
    });

    it("assigneeId null si non assigné", () => {
      const t = mapper.toTicket({
        ...raw,
        fields: { ...raw.fields, "System.AssignedTo": undefined },
      });
      expect(t.assigneeId).toBeNull();
    });

    it("estimateHours = 0 par défaut", () => {
      const t = mapper.toTicket({
        ...raw,
        fields: { ...raw.fields, "Microsoft.VSTS.Scheduling.OriginalEstimate": undefined },
      });
      expect(t.estimateHours).toBe(0);
    });

    it("storyPoints = 0 par défaut", () => {
      const t = mapper.toTicket({
        ...raw,
        fields: { ...raw.fields, "Microsoft.VSTS.Scheduling.StoryPoints": undefined },
      });
      expect(t.storyPoints).toBe(0);
    });
  });

  describe("toJsonPatch", () => {
    it("génère un patch replace sur le bon chemin ADO", () => {
      expect(mapper.toJsonPatch("startDate", "2026-06-10")).toEqual([
        { op: "replace", path: "/fields/Microsoft.VSTS.Scheduling.StartDate", value: "2026-06-10" },
      ]);
    });

    it("mappe assigneeId vers System.AssignedTo", () => {
      expect(mapper.toJsonPatch("assigneeId", "bob@corp.com")[0].path).toBe(
        "/fields/System.AssignedTo",
      );
    });

    it("génère un 'remove' quand la valeur est null (désassignation)", () => {
      expect(mapper.toJsonPatch("assigneeId", null)).toEqual([
        { op: "remove", path: "/fields/System.AssignedTo" },
      ]);
    });

    it("joint les tags avec '; ' vers System.Tags", () => {
      expect(mapper.toJsonPatch("tags", ["auth", "perf"])).toEqual([
        { op: "replace", path: "/fields/System.Tags", value: "auth; perf" },
      ]);
    });

    it("tableau de tags vide => remove", () => {
      expect(mapper.toJsonPatch("tags", [])).toEqual([
        { op: "remove", path: "/fields/System.Tags" },
      ]);
    });

    it("story points à 0 reste un replace (0 est valide)", () => {
      expect(mapper.toJsonPatch("storyPoints", 0)).toEqual([
        { op: "replace", path: "/fields/Microsoft.VSTS.Scheduling.StoryPoints", value: 0 },
      ]);
    });

    it("mappe state vers System.State", () => {
      expect(mapper.toJsonPatch("state", "Active")).toEqual([
        { op: "replace", path: "/fields/System.State", value: "Active" },
      ]);
    });
  });
});
