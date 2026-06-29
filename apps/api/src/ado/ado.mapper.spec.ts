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
    },
  };

  describe("toTicket", () => {
    it("mappe les champs ADO vers un Ticket", () => {
      expect(mapper.toTicket(raw)).toEqual({
        id: "42",
        title: "Faire X",
        assigneeId: "alice@corp.com",
        areaPath: "Proj\\Team",
        iterationId: "5",
        epicId: null,
        epicTitle: null,
        startDate: "2026-06-10T00:00:00Z",
        endDate: "2026-06-12T00:00:00Z",
        estimateHours: 16,
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
  });
});
