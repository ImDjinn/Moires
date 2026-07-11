jest.mock("ioredis", () => {
  const pipeline = {
    del: jest.fn().mockReturnThis(),
    hset: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  };
  const client = {
    pipeline: jest.fn(() => pipeline),
    hgetall: jest.fn(),
    hget: jest.fn(),
    hset: jest.fn(),
    hdel: jest.fn(),
    sadd: jest.fn(),
    srem: jest.fn(),
    smembers: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    expire: jest.fn(),
    disconnect: jest.fn(),
  };
  return { __esModule: true, default: jest.fn(() => client) };
});

import { RedisService } from "./redis.service";
import type { Ticket } from "@moirai/shared";

const config = {
  get: (k: string) => (k === "SESSION_SECRET" ? "test-secret" : "redis://localhost:6379"),
} as any;

const ticket: Ticket = {
  id: "t1",
  title: "T",
  assigneeId: "m1",
  areaPath: "",
  iterationId: "it1",
  epicId: null,
  epicTitle: null,
  workItemType: "User Story",
  parentId: null,
  state: "New",
  tags: [],
  targetDate: null,
  startDate: "2026-06-10",
  endDate: "2026-06-11",
  estimateHours: 8,
  storyPoints: 3,
  adoRev: 1,
  syncStatus: "synced",
};

describe("RedisService", () => {
  let service: RedisService;
  beforeEach(() => {
    service = new RedisService(config);
    jest.clearAllMocks();
  });

  it("compose les clés par session", () => {
    expect(service.ticketsKey("s1")).toBe("session:s1:tickets");
    expect(service.participantsKey("s1")).toBe("session:s1:participants");
    expect(service.presenceKey("s1")).toBe("session:s1:presence");
  });

  it("setTickets purge puis écrit chaque ticket dans une pipeline avec TTL", async () => {
    await service.setTickets("s1", [ticket]);
    const pipeline = (service.client.pipeline as jest.Mock).mock.results[0].value;
    expect(pipeline.del).toHaveBeenCalledWith("session:s1:tickets");
    expect(pipeline.hset).toHaveBeenCalledWith("session:s1:tickets", "t1", JSON.stringify(ticket));
    expect(pipeline.expire).toHaveBeenCalledWith("session:s1:tickets", 86400);
    expect(pipeline.exec).toHaveBeenCalled();
  });

  it("getTickets désérialise les valeurs du hash", async () => {
    (service.client.hgetall as jest.Mock).mockResolvedValue({ t1: JSON.stringify(ticket) });
    expect(await service.getTickets("s1")).toEqual([ticket]);
  });

  it("getTicket renvoie null si absent", async () => {
    (service.client.hget as jest.Mock).mockResolvedValue(null);
    expect(await service.getTicket("s1", "absent")).toBeNull();
  });

  it("updateTicket réécrit le ticket sérialisé", async () => {
    await service.updateTicket("s1", ticket);
    expect(service.client.hset).toHaveBeenCalledWith("session:s1:tickets", "t1", JSON.stringify(ticket));
  });

  it("addParticipant ajoute au set avec TTL", async () => {
    await service.addParticipant("s1", "u1");
    expect(service.client.sadd).toHaveBeenCalledWith("session:s1:participants", "u1");
    expect(service.client.expire).toHaveBeenCalledWith("session:s1:participants", 86400);
  });

  it("getPresences désérialise le hash de présence", async () => {
    const presence = { userId: "u1", displayName: "Alice", color: "#FF6B6B", action: "idle", targetTicketId: null };
    (service.client.hgetall as jest.Mock).mockResolvedValue({ u1: JSON.stringify(presence) });
    expect(await service.getPresences("s1")).toEqual([presence]);
  });

  it("setIterations sérialise la liste avec TTL", async () => {
    const iterations = [{ id: "it1", name: "Sprint 1", path: "P\\S1", startDate: "2026-06-01", finishDate: "2026-06-14" }];
    await service.setIterations("s1", iterations);
    expect(service.client.set).toHaveBeenCalledWith(
      "session:s1:iterations",
      JSON.stringify(iterations),
      "EX",
      86400,
    );
  });

  it("getIterations renvoie [] quand la clé est absente", async () => {
    (service.client.get as jest.Mock).mockResolvedValue(null);
    expect(await service.getIterations("s1")).toEqual([]);
  });

  it("patKey compose la clé par utilisateur", () => {
    expect(service.patKey("u1")).toBe("user:u1:pat");
  });

  it("setUserPat écrit chiffré (jamais le PAT en clair) avec le TTL fourni", async () => {
    await service.setUserPat("u1", "tok123", 28800);
    const [key, value, ex, ttl] = (service.client.set as jest.Mock).mock.calls[0];
    expect(key).toBe("user:u1:pat");
    expect(value).not.toContain("tok123");
    expect([ex, ttl]).toEqual(["EX", 28800]);
  });

  it("getUserPat déchiffre ce que setUserPat a écrit (aller-retour)", async () => {
    await service.setUserPat("u1", "tok123", 28800);
    const blob = (service.client.set as jest.Mock).mock.calls[0][1];
    (service.client.get as jest.Mock).mockResolvedValue(blob);
    expect(await service.getUserPat("u1")).toBe("tok123");
  });

  it("getUserPat renvoie null si absent", async () => {
    (service.client.get as jest.Mock).mockResolvedValue(null);
    expect(await service.getUserPat("u1")).toBeNull();
  });

  it("deleteUserPat supprime la clé du PAT", async () => {
    await service.deleteUserPat("u1");
    expect(service.client.del).toHaveBeenCalledWith("user:u1:pat");
  });

  it("clearSyncSlot supprime le créneau de sync de la session", async () => {
    await service.clearSyncSlot("s1");
    expect(service.client.del).toHaveBeenCalledWith("session:s1:ado-sync-slot");
  });
});
