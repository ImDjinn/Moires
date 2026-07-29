import { CapacitiesRepo } from "./capacities.repo";
import type { TeamMember } from "@moires/shared";

function makeRepo() {
  const capacity = {
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue(undefined),
    deleteMany: jest.fn().mockResolvedValue(undefined),
    createMany: jest.fn().mockResolvedValue(undefined),
  };
  const repo = new CapacitiesRepo({ capacity } as any);
  return { repo, capacity };
}

const member = (id: string): TeamMember => ({ id, displayName: id, capacityHoursPerDay: 8 });

describe("CapacitiesRepo", () => {
  it("ne stocke pas l'identifiant en clair (hash) mais le remappe via l'équipe", async () => {
    const { repo, capacity } = makeRepo();
    // On récupère le hash tel qu'écrit par set(), puis on vérifie que list() le
    // remappe vers le memberId d'origine — sans jamais stocker l'email.
    await repo.set("p1", { memberId: "alice@corp.com", iterationPath: "P\\S1", storyPoints: 6 });
    const stored = capacity.upsert.mock.calls[0][0].create;
    expect(stored.memberHash).not.toContain("alice");
    expect(stored.memberHash).toMatch(/^[a-f0-9]{64}$/);

    capacity.findMany.mockResolvedValue([{ iterationPath: "P\\S1", memberHash: stored.memberHash, value: 6 }]);
    const list = await repo.list("p1", [member("alice@corp.com"), member("bob@corp.com")]);
    expect(list).toEqual([{ memberId: "alice@corp.com", iterationPath: "P\\S1", storyPoints: 6 }]);
  });

  it("ignore les lignes dont le membre n'est plus dans l'équipe", async () => {
    const { repo, capacity } = makeRepo();
    capacity.findMany.mockResolvedValue([{ iterationPath: "P\\S1", memberHash: "deadbeef", value: 5 }]);
    const list = await repo.list("p1", [member("alice@corp.com")]);
    expect(list).toEqual([]);
  });

  it("upsert quand la capacité est >= 0 (0 = absent, ligne conservée)", async () => {
    const { repo, capacity } = makeRepo();
    await repo.set("p1", { memberId: "m1", iterationPath: "P\\S1", storyPoints: 0 });
    expect(capacity.upsert).toHaveBeenCalledTimes(1);
    expect(capacity.deleteMany).not.toHaveBeenCalled();
    expect(capacity.upsert.mock.calls[0][0].create.value).toBe(0);
  });

  it("supprime la ligne quand la capacité est négative", async () => {
    const { repo, capacity } = makeRepo();
    await repo.set("p1", { memberId: "m1", iterationPath: "P\\S1", storyPoints: -1 });
    expect(capacity.deleteMany).toHaveBeenCalledTimes(1);
    expect(capacity.upsert).not.toHaveBeenCalled();
  });

  it("seed insère sans écraser l'existant (skipDuplicates)", async () => {
    const { repo, capacity } = makeRepo();
    await repo.seed("p1", [{ memberId: "m1", iterationPath: "P\\S1", storyPoints: 8 }]);
    expect(capacity.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it("seed ne fait rien si la liste est vide", async () => {
    const { repo, capacity } = makeRepo();
    await repo.seed("p1", []);
    expect(capacity.createMany).not.toHaveBeenCalled();
  });
});
