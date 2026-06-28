import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";

import { AdoController } from "../src/ado/ado.controller";
import { AdoService } from "../src/ado/ado.service";
import { SessionsController } from "../src/sessions/sessions.controller";
import { SessionsService } from "../src/sessions/sessions.service";
import { SyncService } from "../src/sync/sync.service";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { AuthGuard } from "../src/auth/auth.guard";

// Cookie de session authentifiée, tel que posé par /auth/callback.
const authCookie = `session_user=${encodeURIComponent(
  JSON.stringify({ id: "u1", displayName: "Alice" }),
)}`;

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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdoController, SessionsController, AuthController],
      providers: [
        AuthGuard,
        { provide: AdoService, useValue: ado },
        { provide: SessionsService, useValue: sessions },
        { provide: SyncService, useValue: sync },
        {
          provide: AuthService,
          useValue: { getLoginUrl: jest.fn(), refreshToken: jest.fn().mockResolvedValue("new-token") },
        },
        { provide: ConfigService, useValue: { get: () => "http://localhost:5173" } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
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
  });

  describe("/auth/me", () => {
    it("renvoie l'utilisateur authentifié", () =>
      http()
        .get("/auth/me")
        .set("Cookie", authCookie)
        .expect(200)
        .expect({ id: "u1", displayName: "Alice" }));

    it("401 sans cookie de session", () => http().get("/auth/me").expect(401));
  });

  describe("/auth/refresh", () => {
    it("204 avec un token ADO présent", () =>
      http().post("/auth/refresh").set("Cookie", "ado_token=abc").expect(204));
    it("401 sans token ADO", () => http().post("/auth/refresh").expect(401));
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
