import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import type { Operation, PresenceState } from "@moires/shared";
import { ROOM } from "@moires/shared";
import { OperationsHandler } from "./operations.handler";
import { PresenceHandler } from "./presence.handler";

@WebSocketGateway({ cors: { origin: "*", credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private operationsHandler: OperationsHandler,
    private presenceHandler: PresenceHandler,
  ) {}

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
