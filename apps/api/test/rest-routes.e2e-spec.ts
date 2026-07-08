import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { createHmac } from "crypto";
import request from "supertest";

import { AdoController } from "../src/ado/ado.controller";
import { AdoService } from "../src/ado/ado.service";
import { SessionsController } from "../src/sessions/sessions.controller";
import { SessionsService } from "../src/sessions/sessions.service";
import { SessionMemberGuard } from "../src/sessions/session-access";
import { SyncService } from "../src/sync/sync.service";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { AuthGuard } from "../src/auth/auth.guard";
import { PrismaService } from "../src/database/prisma.service";
import { RedisService } from "../src/database/redis.service";

const SECRET = "test-secret";

// Reproduit cookie-signature.sign, tel que cookie-parser le vérifie.
function sign(name: string, value: string): string {
  const mac = createHmac("sha256", SECRET).update(value).digest("base64").replace(/=+$/, "");
  return `${name}=${encodeURIComponent("s:" + value + "." + mac)}`;
}

// Cookie d'une session authentifiée : identité signée (avec expiration) + org sélectionnée signée.
const authUser = { id: "u1", displayName: "Alice", exp: Date.now() + 60 * 60 * 1000 };
const authCookie = [
  sign("session_user", JSON.stringify(authUser)),
  sign("ado_org", "myorg"),
].join("; ");

const snapshot = {
  sessionId: "s1",
  tickets: [],
  participants: [],
  teamMembers: [],
};

describe("Routes REST (e2e, services mockés)", () => {
  let app: INestApplication;

  const ado = {
    getProjects: jest.fn().mockResolvedValue([{ id: "p1", name: "Projet Alpha" }]),
    getIterations: jest.fn().mockResolvedValue([{ id: "it1", name: "Sprint 1" }]),
    getAreas: jest.fn().mockResolvedValue([{ path: "Proj\\Team" }]),
    getTeamMembers: jest
      .fn()
      .mockResolvedValue([{ id: "m1", displayName: "Alice", capacityHoursPerDay: 8 }]),
  };
  const sessions = {
    createSession: jest.fn().mockResolvedValue(snapshot),
    getSnapshot: jest.fn().mockResolvedValue(snapshot),
    getAuditLog: jest.fn().mockResolvedValue([]),
  };
  const sync = { syncIncremental: jest.fn().mockResolvedValue(snapshot) };
  // u1 est le créateur de s1 → membre autorisé.
  const prisma = {
    planningSession: { findUnique: jest.fn().mockResolvedValue({ createdBy: "u1" }) },
    user: { update: jest.fn().mockResolvedValue({}) },
  };
  const redis = {
    getParticipants: jest.fn().mockResolvedValue([]),
    setUserToken: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdoController, SessionsController, AuthController],
      providers: [
        AuthGuard,
        SessionMemberGuard,
        { provide: AdoService, useValue: ado },
        { provide: SessionsService, useValue: sessions },
        { provide: SyncService, useValue: sync },
        {
          provide: AuthService,
          useValue: { loginWithPat: jest.fn() },
        },
        { provide: ConfigService, useValue: { get: () => "http://localhost:5173" } },
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser(SECRET));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe("garde d'authentification", () => {
    it("401 sur /ado/projects sans cookie", () => http().get("/ado/projects").expect(401));
    it("401 sur /sessions sans cookie", () =>
      http().post("/sessions").send({ adoProjectId: "p1", adoIterationIds: ["it1"] }).expect(401));
    it("refuse un cookie de session non signé (forgé)", () =>
      http()
        .get("/ado/projects")
        .set("Cookie", `session_user=${encodeURIComponent(JSON.stringify({ id: "attacker" }))}`)
        .expect(401));
  });

  describe("autorisation de session", () => {
    it("403 sur /sessions/:id si l'utilisateur n'est pas membre", async () => {
      prisma.planningSession.findUnique.mockResolvedValueOnce({ createdBy: "someone-else" });
      await http().get("/sessions/s1").set("Cookie", authCookie).expect(403);
    });
  });

  describe("/auth/me", () => {
    it("renvoie l'utilisateur authentifié", () =>
      http()
        .get("/auth/me")
        .set("Cookie", authCookie)
        .expect(200)
        .expect(authUser));

    it("401 sans cookie de session", () => http().get("/auth/me").expect(401));
  });

  describe("/ado/*", () => {
    it("GET /ado/projects", () =>
      http().get("/ado/projects").set("Cookie", authCookie).expect(200).expect([
        { id: "p1", name: "Projet Alpha" },
      ]));
    it("GET /ado/projects/:id/iterations", () =>
      http().get("/ado/projects/p1/iterations").set("Cookie", authCookie).expect(200));
    it("GET /ado/projects/:id/areas", () =>
      http().get("/ado/projects/p1/areas").set("Cookie", authCookie).expect(200));
    it("GET /ado/projects/:id/team-members", () =>
      http().get("/ado/projects/p1/team-members").set("Cookie", authCookie).expect(200));
  });

  describe("/sessions/*", () => {
    it("POST /sessions", () =>
      http()
        .post("/sessions")
        .set("Cookie", authCookie)
        .send({ adoProjectId: "p1", adoIterationIds: ["it1"] })
        .expect(201)
        .expect(snapshot));
    it("GET /sessions/:id", () =>
      http().get("/sessions/s1").set("Cookie", authCookie).expect(200).expect(snapshot));
    it("POST /sessions/:id/sync", () =>
      http().post("/sessions/s1/sync").set("Cookie", authCookie).expect(201));
    it("GET /sessions/:id/audit-log", () =>
      http().get("/sessions/s1/audit-log").set("Cookie", authCookie).expect(200));
  });
});
