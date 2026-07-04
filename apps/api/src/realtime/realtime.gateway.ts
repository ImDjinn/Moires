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
import type { Operation, PresenceState } from "@moirai/shared";
import { ROOM } from "@moirai/shared";
import { RedisService } from "../database/redis.service";
import { BroadcastService } from "./broadcast.service";
import { OperationsHandler } from "./operations.handler";
import { PresenceHandler } from "./presence.handler";

function parseAdoToken(cookieHeader: string | string[] | undefined): string | undefined {
  const str = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;
  if (!str) return undefined;
  const match = str.match(/(?:^|;\s*)ado_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

@WebSocketGateway({ cors: { origin: "*", credentials: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private operationsHandler: OperationsHandler,
    private presenceHandler: PresenceHandler,
    private redis: RedisService,
    private broadcast: BroadcastService,
  ) {}

  afterInit(server: Server) {
    this.broadcast.setServer(server);
  }

  async handleConnection(client: Socket) {
    const sessionId = client.handshake.query.sessionId as string;
    const userId = client.handshake.query.userId as string;
    const displayName = client.handshake.query.displayName as string;
    if (!sessionId || !userId) {
      client.disconnect();
      return;
    }
    client.data = { sessionId, userId, displayName };
    client.join(ROOM(sessionId));

    const token = parseAdoToken(client.handshake.headers.cookie);
    if (token) await this.redis.setUserToken(sessionId, userId, token);

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
