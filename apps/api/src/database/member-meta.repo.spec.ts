import { MemberMetaRepo } from "./member-meta.repo";
import type { TeamMember } from "@moirai/shared";

function makeRepo() {
  const memberMeta = {
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue(undefined),
  };
  const repo = new MemberMetaRepo({ memberMeta } as any);
  return { repo, memberMeta };
}

const member = (id: string): TeamMember => ({ id, displayName: id, capacityHoursPerDay: 8 });

describe("MemberMetaRepo", () => {
  it("ne stocke pas l'identifiant en clair (hash) mais le remappe via l'équipe", async () => {
    const { repo, memberMeta } = makeRepo();
    await repo.set("p1", { memberId: "alice@corp.com", poste: "Backend Lead", role: "Tech Lead" });
    const stored = memberMeta.upsert.mock.calls[0][0].create;
    expect(stored.memberHash).not.toContain("alice");
    expect(stored.memberHash).toMatch(/^[a-f0-9]{64}$/);

    memberMeta.findMany.mockResolvedValue([{ memberHash: stored.memberHash, poste: "Backend Lead", role: "Tech Lead" }]);
    const list = await repo.list("p1", [member("alice@corp.com"), member("bob@corp.com")]);
    expect(list).toEqual([{ memberId: "alice@corp.com", poste: "Backend Lead", role: "Tech Lead" }]);
  });

  it("ignore les lignes dont le membre n'est plus dans l'équipe", async () => {
    const { repo, memberMeta } = makeRepo();
    memberMeta.findMany.mockResolvedValue([{ memberHash: "deadbeef", poste: "X", role: "Y" }]);
    const list = await repo.list("p1", [member("alice@corp.com")]);
    expect(list).toEqual([]);
  });
});
