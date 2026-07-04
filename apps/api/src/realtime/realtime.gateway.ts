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

function parseAdoToken(cookieHeader: string | string[] | undefined): string | undefined {
  const str = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;
  if (!str) return undefined;
  const match = str.match(/(?:^|;\s*)ado_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

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
    let identity: { id: string; displayName: string } | undefined;
    if (raw) {
      try {
        identity = JSON.parse(raw);
      } catch {
        /* cookie illisible */
      }
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

    const token = parseAdoToken(client.handshake.headers.cookie);
    if (token) await this.redis.setUserToken(sessionId, identity.id, token);

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
