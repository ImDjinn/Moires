import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { AdoService } from "./ado.service";

@Controller("ado")
@UseGuards(AuthGuard)
export class AdoController {
  constructor(private ado: AdoService) {}

  private getToken(req: Request): string {
    return req.cookies?.ado_token;
  }

  @Get("projects")
  getProjects(@Req() req: Request) {
    return this.ado.getProjects(this.getToken(req));
  }

  @Get("projects/:id/iterations")
  getIterations(@Param("id") id: string, @Req() req: Request) {
    return this.ado.getIterations(id, this.getToken(req));
  }

  @Get("projects/:id/areas")
  getAreas(@Param("id") id: string, @Req() req: Request) {
    return this.ado.getAreas(id, this.getToken(req));
  }

  @Get("projects/:id/team-members")
  getTeamMembers(@Param("id") id: string, @Req() req: Request) {
    return this.ado.getTeamMembers(id, this.getToken(req));
  }
}
