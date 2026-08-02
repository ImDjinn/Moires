import { Injectable } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import type { PresenceState } from "@moires/shared";
import { ROOM } from "@moires/shared";
import { RedisService } from "../database/redis.service";

const COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F"];
let colorIdx = 0;

const ACTIONS = new Set(["idle", "dragging", "resizing", "away"]);

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

    // État courant renvoyé à l'arrivant : couvre la reconnexion (les user-left
    // émis pendant la coupure sont perdus, le pair resterait compté à vie) et
    // le snapshot REST, obtenu avant l'entrée dans la room. Les sockets
    // réellement présentes font foi : un arrêt brutal de l'API laisse des
    // présences fantômes dans Redis (aucun handleLeave ne s'exécute).
    const sockets = await server.in(ROOM(sessionId)).fetchSockets();
    const live = new Set(sockets.map((s) => s.data.userId));
    const peers = (await this.redis.getPresences(sessionId)).filter((p) => live.has(p.userId));
    client.emit("presence:sync", peers);

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
