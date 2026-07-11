import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import Redis from "ioredis";
import type { Ticket, PresenceState, Iteration, TeamMember, AdoState } from "@moirai/shared";

const TTL = 86400; // 24h

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  // Clé AES-256 dérivée de SESSION_SECRET : les PATs sont chiffrés au repos dans
  // Redis (une compromission de Redis seul — dump RDB, port exposé — ne les expose pas).
  private readonly tokenCryptoKey: Buffer;

  constructor(config: ConfigService) {
    this.client = new Redis(config.get<string>("REDIS_URL")!);
    this.tokenCryptoKey = createHash("sha256").update(config.get<string>("SESSION_SECRET")!).digest();
  }

  // AES-256-GCM, blob base64 = iv (12) + authTag (16) + ciphertext.
  private encryptToken(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.tokenCryptoKey, iv);
    const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
  }

  // null si le blob est absent, altéré, ou chiffré avec un autre secret.
  private decryptToken(blob: string): string | null {
    try {
      const buf = Buffer.from(blob, "base64");
      const decipher = createDecipheriv("aes-256-gcm", this.tokenCryptoKey, buf.subarray(0, 12));
      decipher.setAuthTag(buf.subarray(12, 28));
      return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
    } catch {
      return null;
    }
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

  patKey(userId: string) {
    return `user:${userId}:pat`;
  }

  /**
   * PAT chiffré au repos, stocké UNIQUEMENT côté serveur (jamais dans un cookie
   * navigateur) avec un TTL aligné sur la durée de session : quand le cookie
   * d'identité expire, le PAT disparaît en même temps.
   */
  async setUserPat(userId: string, pat: string, ttlSeconds: number): Promise<void> {
    await this.client.set(this.patKey(userId), this.encryptToken(pat), "EX", ttlSeconds);
  }

  async getUserPat(userId: string): Promise<string | null> {
    const blob = await this.client.get(this.patKey(userId));
    return blob ? this.decryptToken(blob) : null;
  }

  /** Appelé au logout : sans ça, le writeback pourrait continuer à écrire dans ADO. */
  async deleteUserPat(userId: string): Promise<void> {
    await this.client.del(this.patKey(userId));
  }

  /**
   * Réserve le créneau de sync ADO de la session pour `seconds` secondes.
   * Renvoie false si un sync a déjà eu lieu dans la fenêtre — l'appelant sert
   * alors le cache Redis au lieu de re-interroger ADO.
   */
  async acquireSyncSlot(sessionId: string, seconds: number): Promise<boolean> {
    const res = await this.client.set(`session:${sessionId}:ado-sync-slot`, "1", "EX", seconds, "NX");
    return res === "OK";
  }

  /**
   * Invalide le créneau de sync : le prochain poll refait un vrai sync ADO au
   * lieu de servir le cache. Utilisé par le webhook ADO pour propager un
   * changement externe sans appeler ADO lui-même (donc sans credential).
   */
  async clearSyncSlot(sessionId: string): Promise<void> {
    await this.client.del(`session:${sessionId}:ado-sync-slot`);
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
