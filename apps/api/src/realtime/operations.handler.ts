import { Injectable } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import type { Operation } from "@moirai/shared";
import { ROOM } from "@moirai/shared";
import { SessionsService } from "../sessions/sessions.service";

@Injectable()
export class OperationsHandler {
  constructor(private sessions: SessionsService) {}

  async handle(server: Server, client: Socket, op: Operation) {
    const { sessionId, userId } = client.data;
    // L'auteur est l'identité authentifiée de la socket, jamais celle du payload
    // (sinon le journal d'audit et le choix du token ADO seraient falsifiables).
    op.userId = userId;
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
