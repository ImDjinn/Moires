import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import type { Ticket, PresenceState } from "@moires/shared";

const TTL = 86400; // 24h

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.get<string>("REDIS_URL")!);
  }

  onModuleDestroy() {
    this.client.disconnect();
  }

  ticketsKey(sessionId: string) {
    return `session:${sessionId}:tickets`;
  }

  participantsKey(sessionId: string) {
    return `session:${sessionId}:participants`;
  }

  presenceKey(sessionId: string) {
    return `session:${sessionId}:presence`;
  }

  async setTickets(sessionId: string, tickets: Ticket[]) {
    const key = this.ticketsKey(sessionId);
    const pipeline = this.client.pipeline();
    pipeline.del(key);
    for (const t of tickets) {
      pipeline.hset(key, t.id, JSON.stringify(t));
    }
    pipeline.expire(key, TTL);
    await pipeline.exec();
  }

  async getTickets(sessionId: string): Promise<Ticket[]> {
    const data = await this.client.hgetall(this.ticketsKey(sessionId));
    return Object.values(data).map((v) => JSON.parse(v));
  }

  async updateTicket(sessionId: string, ticket: Ticket) {
    await this.client.hset(this.ticketsKey(sessionId), ticket.id, JSON.stringify(ticket));
  }

  async getTicket(sessionId: string, ticketId: string): Promise<Ticket | null> {
    const raw = await this.client.hget(this.ticketsKey(sessionId), ticketId);
    return raw ? JSON.parse(raw) : null;
  }

  async addParticipant(sessionId: string, userId: string) {
    await this.client.sadd(this.participantsKey(sessionId), userId);
    await this.client.expire(this.participantsKey(sessionId), TTL);
  }

  async removeParticipant(sessionId: string, userId: string) {
    await this.client.srem(this.participantsKey(sessionId), userId);
  }

  async getParticipants(sessionId: string): Promise<string[]> {
    return this.client.smembers(this.participantsKey(sessionId));
  }

  async setPresence(sessionId: string, presence: PresenceState) {
    await this.client.hset(
      this.presenceKey(sessionId),
      presence.userId,
      JSON.stringify(presence),
    );
    await this.client.expire(this.presenceKey(sessionId), TTL);
  }

  async removePresence(sessionId: string, userId: string) {
    await this.client.hdel(this.presenceKey(sessionId), userId);
  }

  async getPresences(sessionId: string): Promise<PresenceState[]> {
    const data = await this.client.hgetall(this.presenceKey(sessionId));
    return Object.values(data).map((v) => JSON.parse(v));
  }
}
