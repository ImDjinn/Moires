import { Controller, Get, Post, Put, Param, Body, Req, UseGuards, BadRequestException } from "@nestjs/common";
import { Request } from "express";
import type { CreateSessionDto, Capacity, MemberMeta } from "@moires/shared";
import { AuthGuard, AuthenticatedUser } from "../auth/auth.guard";
import { User } from "../auth/user.decorator";
import { str, optStr, num, strArray } from "../common/validate";
import { SessionMemberGuard } from "./session-access";
import { SessionsService } from "./sessions.service";
import { SyncService } from "../sync/sync.service";
import { RedisService } from "../database/redis.service";

// Plafond d'une capacité : au-delà c'est une saisie erronée (une itération ne
// dépasse pas quelques dizaines de jours ouvrés). Une valeur négative est la
// convention de suppression (retour au défaut) — cf. CapacitiesRepo.set.
const CAPACITY_MAX = 1000;

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
  async create(@Body() body: CreateSessionDto, @Req() req: Request, @User() user: AuthenticatedUser) {
    const org = req.signedCookies?.ado_org;
    if (!org) throw new BadRequestException("No Azure DevOps organization selected");
    const dto: CreateSessionDto = {
      adoProjectId: str(body?.adoProjectId, "adoProjectId", 200),
      // `.map()` plus bas : un non-tableau ferait un 500 au lieu d'un 400.
      areaPaths: body?.areaPaths === undefined ? undefined : strArray(body.areaPaths, "areaPaths"),
    };
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

  @Get(":id/audit-log")
  @UseGuards(SessionMemberGuard)
  getAuditLog(@Param("id") id: string) {
    return this.sessions.getAuditLog(id);
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

  @Get(":id/tickets/:ticketId/comments")
  @UseGuards(SessionMemberGuard)
  async getComments(
    @Param("id") id: string,
    @Param("ticketId") ticketId: string,
    @User() user: AuthenticatedUser,
  ) {
    return this.sessions.getComments(id, ticketId, await this.getToken(user.id));
  }

  @Get(":id/field-defs/:type")
  @UseGuards(SessionMemberGuard)
  async getTypeFields(@Param("id") id: string, @Param("type") type: string, @User() user: AuthenticatedUser) {
    return this.sessions.getTypeFields(id, type, await this.getToken(user.id));
  }

  @Put(":id/capacities")
  @UseGuards(SessionMemberGuard)
  setCapacity(@Param("id") id: string, @Body() body: Capacity) {
    const cap: Capacity = {
      memberId: str(body?.memberId, "memberId", 200),
      iterationPath: str(body?.iterationPath, "iterationPath", 400),
      storyPoints: num(body?.storyPoints, "storyPoints", -1, CAPACITY_MAX),
    };
    return this.sessions.setCapacity(id, cap);
  }

  @Put(":id/member-meta")
  @UseGuards(SessionMemberGuard)
  setMemberMeta(@Param("id") id: string, @Body() body: MemberMeta) {
    const meta: MemberMeta = {
      memberId: str(body?.memberId, "memberId", 200),
      // Poste et rôle peuvent être vidés : chaîne vide acceptée, longueur bornée.
      poste: optStr(body?.poste, "poste", 100),
      role: optStr(body?.role, "role", 100),
    };
    return this.sessions.setMemberMeta(id, meta);
  }
}
