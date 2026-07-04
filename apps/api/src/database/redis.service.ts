import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import type { Ticket, PresenceState, Iteration, TeamMember, AdoState } from "@moirai/shared";

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

  iterationsKey(sessionId: string) {
    return `session:${sessionId}:iterations`;
  }

  teamMembersKey(sessionId: string) {
    return `session:${sessionId}:team-members`;
  }

  tokenKey(sessionId: string, userId: string) {
    return `session:${sessionId}:token:${userId}`;
  }

  async setUserToken(sessionId: string, userId: string, token: string): Promise<void> {
    await this.client.set(this.tokenKey(sessionId, userId), token, "EX", 3600);
    await this.client.set(`session:${sessionId}:token`, token, "EX", 3600);
  }

  async getUserToken(sessionId: string, userId: string): Promise<string | null> {
    return this.client.get(this.tokenKey(sessionId, userId));
  }

  async getSessionToken(sessionId: string): Promise<string | null> {
    return this.client.get(`session:${sessionId}:token`);
  }

  async setTeamMembers(sessionId: string, members: TeamMember[]) {
    await this.client.set(this.teamMembersKey(sessionId), JSON.stringify(members), "EX", TTL);
  }

  async getTeamMembers(sessionId: string): Promise<TeamMember[]> {
    const raw = await this.client.get(this.teamMembersKey(sessionId));
    return raw ? JSON.parse(raw) : [];
  }

  async setStates(sessionId: string, states: AdoState[]) {
    await this.client.set(`session:${sessionId}:states`, JSON.stringify(states), "EX", TTL);
  }

  async getStates(sessionId: string): Promise<AdoState[]> {
    const raw = await this.client.get(`session:${sessionId}:states`);
    return raw ? JSON.parse(raw) : [];
  }

  async setIterations(sessionId: string, iterations: Iteration[]) {
    await this.client.set(
      this.iterationsKey(sessionId),
      JSON.stringify(iterations),
      "EX",
      TTL,
    );
  }

  async getIterations(sessionId: string): Promise<Iteration[]> {
    const raw = await this.client.get(this.iterationsKey(sessionId));
    return raw ? JSON.parse(raw) : [];
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
