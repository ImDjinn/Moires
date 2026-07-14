import { Controller, Get, Post, Put, Param, Body, Req, UseGuards, BadRequestException } from "@nestjs/common";
import { Request } from "express";
import type { CreateSessionDto, Capacity, MemberMeta } from "@moirai/shared";
import { AuthGuard, AuthenticatedUser } from "../auth/auth.guard";
import { User } from "../auth/user.decorator";
import { SessionMemberGuard } from "./session-access";
import { SessionsService } from "./sessions.service";
import { SyncService } from "../sync/sync.service";
import { RedisService } from "../database/redis.service";

@Controller("sessions")
@UseGuards(AuthGuard)
export class SessionsController {
  constructor(
    private sessions: SessionsService,
    private syncService: SyncService,
    private redis: RedisService,
  ) {}

  // PAT chiffré côté serveur (posé au login) : le navigateur ne le porte plus.
  // Absent (TTL expiré) → chaîne vide → adoFetch lève 401 → le front déconnecte.
  private async getToken(userId: string): Promise<string> {
    return (await this.redis.getUserPat(userId)) ?? "";
  }

  @Post()
  async create(@Body() dto: CreateSessionDto, @Req() req: Request, @User() user: AuthenticatedUser) {
    const org = req.signedCookies?.ado_org;
    if (!org) throw new BadRequestException("No Azure DevOps organization selected");
    return this.sessions.createSession(dto, user.id, org, await this.getToken(user.id));
  }

  @Get(":id")
  @UseGuards(SessionMemberGuard)
  getSnapshot(@Param("id") id: string) {
    return this.sessions.getSnapshot(id);
  }

  @Post(":id/sync")
  @UseGuards(SessionMemberGuard)
  async sync(@Param("id") id: string, @User() user: AuthenticatedUser) {
    // Le PAT vit côté serveur avec un TTL aligné sur la session : plus besoin
    // de le rafraîchir à chaque poll comme quand il transitait par cookie.
    return this.syncService.syncIncremental(id, await this.getToken(user.id));
  }

  @Post(":id/tickets/:ticketId/duplicate")
  @UseGuards(SessionMemberGuard)
  async duplicateTicket(
    @Param("id") id: string,
    @Param("ticketId") ticketId: string,
    @User() user: AuthenticatedUser,
  ) {
    return this.sessions.duplicateTicket(id, ticketId, await this.getToken(user.id));
  }

  @Get(":id/field-defs/:type")
  @UseGuards(SessionMemberGuard)
  async getTypeFields(@Param("id") id: string, @Param("type") type: string, @User() user: AuthenticatedUser) {
    return this.sessions.getTypeFields(id, type, await this.getToken(user.id));
  }

  @Put(":id/capacities")
  @UseGuards(SessionMemberGuard)
  setCapacity(@Param("id") id: string, @Body() cap: Capacity) {
    return this.sessions.setCapacity(id, cap);
  }

  @Put(":id/member-meta")
  @UseGuards(SessionMemberGuard)
  setMemberMeta(@Param("id") id: string, @Body() meta: MemberMeta) {
    return this.sessions.setMemberMeta(id, meta);
  }
}
