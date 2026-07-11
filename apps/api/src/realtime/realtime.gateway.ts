import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { ConfigService } from "@nestjs/config";
import type { Operation, PresenceState } from "@moirai/shared";
import { ROOM } from "@moirai/shared";
import { RedisService } from "../database/redis.service";
import { PrismaService } from "../database/prisma.service";
import { readSignedCookie } from "../auth/cookies";
import { isSessionMember } from "../sessions/session-access";
import { BroadcastService } from "./broadcast.service";
import { OperationsHandler } from "./operations.handler";
import { PresenceHandler } from "./presence.handler";

// Origine restreinte au front (identique au CORS HTTP) : empêche un site tiers
// d'ouvrir une socket authentifiée par le cookie d'un utilisateur connecté.
@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL || "http://localhost:5173", credentials: true },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private operationsHandler: OperationsHandler,
    private presenceHandler: PresenceHandler,
    private redis: RedisService,
    private broadcast: BroadcastService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  afterInit(server: Server) {
    this.broadcast.setServer(server);
  }

  async handleConnection(client: Socket) {
    const sessionId = client.handshake.query.sessionId as string;
    // Identité dérivée du cookie signé — jamais des query params (falsifiables).
    const secret = this.config.get<string>("SESSION_SECRET")!;
    const raw = readSignedCookie(client.handshake.headers.cookie, "session_user", secret);
    let identity: { id: string; displayName: string; exp?: number } | undefined;
    if (raw) {
      try {
        identity = JSON.parse(raw);
      } catch {
        /* cookie illisible */
      }
    }
    // Même règle d'expiration que l'AuthGuard HTTP : exp porté par le contenu signé.
    if (identity && (typeof identity.exp !== "number" || Date.now() > identity.exp)) {
      identity = undefined;
    }
    if (!sessionId || !identity?.id) {
      client.disconnect();
      return;
    }
    if (!(await isSessionMember(this.prisma, this.redis, sessionId, identity.id))) {
      client.disconnect();
      return;
    }
    client.data = { sessionId, userId: identity.id, displayName: identity.displayName };
    client.join(ROOM(sessionId));

    // Le PAT n'arrive plus par cookie : le writeback lit le store serveur
    // (user:<id>:pat, posé au login avec un TTL aligné sur la session).
    await this.presenceHandler.handleJoin(this.server, client);
  }

  async handleDisconnect(client: Socket) {
    await this.presenceHandler.handleLeave(this.server, client);
  }

  @SubscribeMessage("operation:submit")
  async handleOperation(
    @ConnectedSocket() client: Socket,
    @MessageBody() op: Operation,
  ) {
    await this.operationsHandler.handle(this.server, client, op);
  }

  @SubscribeMessage("presence:update")
  async handlePresence(
    @ConnectedSocket() client: Socket,
    @MessageBody() p: PresenceState,
  ) {
    await this.presenceHandler.handleUpdate(this.server, client, p);
  }
}
