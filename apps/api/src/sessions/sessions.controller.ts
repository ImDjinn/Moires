import { Controller, Get, Post, Param, Body, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import type { CreateSessionDto } from "@moires/shared";
import { AuthGuard } from "../auth/auth.guard";
import { SessionsService } from "./sessions.service";
import { SyncService } from "../sync/sync.service";

@Controller("sessions")
@UseGuards(AuthGuard)
export class SessionsController {
  constructor(
    private sessions: SessionsService,
    private syncService: SyncService,
  ) {}

  @Post()
  create(@Body() dto: CreateSessionDto, @Req() req: Request) {
    const user = (req as any).user;
    const token = req.cookies?.ado_token;
    return this.sessions.createSession(dto, user.id, token);
  }

  @Get(":id")
  getSnapshot(@Param("id") id: string) {
    return this.sessions.getSnapshot(id);
  }

  @Post(":id/sync")
  sync(@Param("id") id: string, @Req() req: Request) {
    const token = req.cookies?.ado_token;
    return this.syncService.syncIncremental(id, token);
  }

  @Get(":id/audit-log")
  getAuditLog(@Param("id") id: string) {
    return this.sessions.getAuditLog(id);
  }
}
