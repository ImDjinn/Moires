import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { Request } from "express";
import { AuthGuard, AuthenticatedUser } from "../auth/auth.guard";
import { User } from "../auth/user.decorator";
import { RedisService } from "../database/redis.service";
import { AdoService } from "./ado.service";

@Controller("ado")
@UseGuards(AuthGuard)
export class AdoController {
  constructor(
    private ado: AdoService,
    private redis: RedisService,
  ) {}

  // PAT chiffré côté serveur (posé au login) : le navigateur ne le porte plus.
  // Absent (TTL expiré) → chaîne vide → adoFetch lève 401 → le front déconnecte.
  private async getToken(userId: string): Promise<string> {
    return (await this.redis.getUserPat(userId)) ?? "";
  }

  private getOrg(req: Request): string {
    const org = req.signedCookies?.ado_org;
    if (!org) throw new BadRequestException("No Azure DevOps organization selected");
    return org;
  }

  // L'org est choisie et validée à la connexion (PAT scopé à une seule org) :
  // on renvoie simplement celle du cookie, sans appel cross-org à ADO.
  // Pas de route pour en changer : `ado_org` n'est posé que par /auth/login,
  // après validation du PAT contre l'org. Une route qui le réécrirait sur simple
  // demande donnerait accès aux sessions (donc aux tickets en cache) d'une org
  // dont l'utilisateur n'a aucun jeton — cf. isSessionMember.
  @Get("organizations")
  getOrganizations(@Req() req: Request) {
    const org = req.signedCookies?.ado_org ?? null;
    return { organizations: org ? [{ id: org, name: org }] : [], selected: org };
  }

  @Get("projects")
  async getProjects(@Req() req: Request, @User() user: AuthenticatedUser) {
    return this.ado.getProjects(this.getOrg(req), await this.getToken(user.id));
  }

  @Get("projects/:id/iterations")
  async getIterations(@Param("id") id: string, @Req() req: Request, @User() user: AuthenticatedUser) {
    return this.ado.getIterations(this.getOrg(req), id, await this.getToken(user.id));
  }

  @Get("projects/:id/areas")
  async getAreas(@Param("id") id: string, @Req() req: Request, @User() user: AuthenticatedUser) {
    return this.ado.getAreas(this.getOrg(req), id, await this.getToken(user.id));
  }

  @Get("projects/:id/team-members")
  async getTeamMembers(@Param("id") id: string, @Req() req: Request, @User() user: AuthenticatedUser) {
    return this.ado.getTeamMembers(this.getOrg(req), id, await this.getToken(user.id));
  }
}
