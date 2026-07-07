import { Injectable } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import type { Operation } from "@moirai/shared";
import { ROOM, OPERATION_FIELDS } from "@moirai/shared";
import { SessionsService } from "../sessions/sessions.service";

const FIELDS = new Set<string>(OPERATION_FIELDS);

// Le payload WS arrive non typé à l'exécution : sans cette garde, un champ
// arbitraire écraserait n'importe quelle propriété du ticket en cache
// (setTicketField fait `(t as any)[field] = value`).
function isValidOperation(op: Operation): boolean {
  if (typeof op?.ticketId !== "string" || typeof op.field !== "string") return false;
  if (!FIELDS.has(op.field) && !(op.field.startsWith("custom:") && op.field.length > "custom:".length)) return false;
  const v = op.value;
  return v === null || typeof v === "string" || typeof v === "number" ||
    (Array.isArray(v) && v.every((x) => typeof x === "string"));
}

@Injectable()
export class OperationsHandler {
  constructor(private sessions: SessionsService) {}

  async handle(server: Server, client: Socket, op: Operation) {
    const { sessionId, userId } = client.data;
    if (!isValidOperation(op)) {
      client.emit("operation:rejected", { op, reason: "Invalid operation" });
      return;
    }
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
