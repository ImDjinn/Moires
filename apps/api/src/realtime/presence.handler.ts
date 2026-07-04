import { Injectable } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import type { PresenceState } from "@moirai/shared";
import { ROOM } from "@moirai/shared";
import { RedisService } from "../database/redis.service";

const COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F"];
let colorIdx = 0;

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
    const { sessionId } = client.data;
    await this.redis.setPresence(sessionId, p);
    client.to(ROOM(sessionId)).emit("presence:broadcast", p);
  }
}
