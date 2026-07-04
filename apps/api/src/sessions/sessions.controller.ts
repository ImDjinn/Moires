import { Controller, Get, Post, Put, Param, Body, Req, UseGuards, BadRequestException } from "@nestjs/common";
import { Request } from "express";
import type { CreateSessionDto, Capacity, MemberMeta } from "@moirai/shared";
import { AuthGuard } from "../auth/auth.guard";
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

  @Post()
  create(@Body() dto: CreateSessionDto, @Req() req: Request) {
    const user = (req as any).user;
    const token = req.cookies?.ado_token;
    const org = req.signedCookies?.ado_org;
    if (!org) throw new BadRequestException("No Azure DevOps organization selected");
    return this.sessions.createSession(dto, user.id, org, token);
  }

  @Get(":id")
  @UseGuards(SessionMemberGuard)
  getSnapshot(@Param("id") id: string) {
    return this.sessions.getSnapshot(id);
  }

  @Post(":id/sync")
  @UseGuards(SessionMemberGuard)
  sync(@Param("id") id: string, @Req() req: Request) {
    const token = req.cookies?.ado_token;
    const user = (req as any).user;
    // Rafraîchit le token Redis à chaque poll (toutes les 5s) pour que le
    // writeback BullMQ ait toujours un token valide, même après reconnexion WS.
    if (token && user?.id) void this.redis.setUserToken(id, user.id, token);
    return this.syncService.syncIncremental(id, token);
  }

  @Post(":id/tickets/:ticketId/duplicate")
  @UseGuards(SessionMemberGuard)
  duplicateTicket(
    @Param("id") id: string,
    @Param("ticketId") ticketId: string,
    @Req() req: Request,
  ) {
    return this.sessions.duplicateTicket(id, ticketId, req.cookies?.ado_token);
  }

  @Get(":id/field-defs/:type")
  @UseGuards(SessionMemberGuard)
  getTypeFields(@Param("id") id: string, @Param("type") type: string, @Req() req: Request) {
    return this.sessions.getTypeFields(id, type, req.cookies?.ado_token);
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

  @Get(":id/audit-log")
  @UseGuards(SessionMemberGuard)
  getAuditLog(@Param("id") id: string) {
    return this.sessions.getAuditLog(id);
  }
}
