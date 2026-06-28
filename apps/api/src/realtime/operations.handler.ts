import { Injectable } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import type { Operation } from "@moires/shared";
import { ROOM } from "@moires/shared";
import { SessionsService } from "../sessions/sessions.service";

@Injectable()
export class OperationsHandler {
  constructor(private sessions: SessionsService) {}

  async handle(server: Server, client: Socket, op: Operation) {
    const { sessionId } = client.data;
    try {
      await this.sessions.applyOperation(sessionId, op);
      server.to(ROOM(sessionId)).emit("operation:applied", {
        ...op,
        serverTimestamp: Date.now(),
      });
    } catch (error: any) {
      client.emit("operation:rejected", {
        op,
        reason: error.message || "Unknown error",
      });
    }
  }
}
