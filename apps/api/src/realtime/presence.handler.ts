import { Injectable } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import type { PresenceState } from "@moirai/shared";
import { ROOM } from "@moirai/shared";
import { RedisService } from "../database/redis.service";

const COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F"];
let colorIdx = 0;

const ACTIONS = new Set(["idle", "dragging", "resizing"]);

// Le payload WS arrive non typé : on reconstruit un PresenceState propre au lieu
// de stocker/rebroadcaster l'objet reçu (champs arbitraires, chaînes énormes).
function sanitizePresence(p: PresenceState): Omit<PresenceState, "userId"> | null {
  if (typeof p?.displayName !== "string" || typeof p.color !== "string") return null;
  if (!ACTIONS.has(p.action)) return null;
  if (p.targetTicketId !== null && typeof p.targetTicketId !== "string") return null;
  const cursor =
    p.cursor && typeof p.cursor.x === "number" && typeof p.cursor.y === "number"
      ? { x: p.cursor.x, y: p.cursor.y }
      : undefined;
  return {
    displayName: p.displayName.slice(0, 200),
    color: p.color.slice(0, 32),
    action: p.action,
    targetTicketId: p.targetTicketId === null ? null : p.targetTicketId.slice(0, 64),
    ...(cursor ? { cursor } : {}),
  };
}

@Injectable()
export class PresenceHandler {
  constructor(private redis: RedisService) {}

  async handleJoin(server: Server, client: Socket) {
    const { sessionId, userId, displayName } = client.data;
    const color = COLORS[colorIdx++ % COLORS.length];
    const presence: PresenceState = {
      userId,
      displayName: displayName || "User",
      color,
      action: "idle",
      targetTicketId: null,
    };
    await this.redis.setPresence(sessionId, presence);
    await this.redis.addParticipant(sessionId, userId);
    client.to(ROOM(sessionId)).emit("presence:user-joined", {
      userId,
      displayName: presence.displayName,
      color,
    });
  }

  async handleLeave(server: Server, client: Socket) {
    const { sessionId, userId } = client.data || {};
    if (!sessionId || !userId) return;
    await this.redis.removePresence(sessionId, userId);
    await this.redis.removeParticipant(sessionId, userId);
    client.to(ROOM(sessionId)).emit("presence:user-left", { userId });
  }

  async handleUpdate(server: Server, client: Socket, p: PresenceState) {
    const { sessionId, userId } = client.data;
    const clean = sanitizePresence(p);
    if (!clean) return;
    // Identité imposée par la socket : empêche d'usurper la présence d'autrui.
    const presence: PresenceState = { ...clean, userId };
    await this.redis.setPresence(sessionId, presence);
    client.to(ROOM(sessionId)).emit("presence:broadcast", presence);
  }
}
