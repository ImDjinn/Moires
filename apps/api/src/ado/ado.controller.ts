import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Res,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AuthGuard, AuthenticatedUser } from "../auth/auth.guard";
import { User } from "../auth/user.decorator";
import { signedCookieOpts } from "../auth/cookies";
import { ADO_ORG_RE } from "../auth/org";
import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../database/redis.service";
import { AdoService } from "./ado.service";

@Controller("ado")
@UseGuards(AuthGuard)
export class AdoController {
  constructor(
    private ado: AdoService,
    private prisma: PrismaService,
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
  @Get("organizations")
  getOrganizations(@Req() req: Request) {
    const org = req.signedCookies?.ado_org ?? null;
    return { organizations: org ? [{ id: org, name: org }] : [], selected: org };
  }

  @Post("organizations/select")
  async selectOrganization(
    @Body() body: { org: string },
    @User() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body?.org) throw new BadRequestException("org is required");
    // L'org est interpolée dans les URLs ADO par toutes les routes en aval.
    if (!ADO_ORG_RE.test(body.org)) throw new BadRequestException("Invalid organization name");
    // Aligné sur la durée restante de la session (exp du cookie signé) : un TTL
    // fixe de 8h faisait « perdre » l'org avant l'expiration d'une session 30 j.
    res.cookie("ado_org", body.org, signedCookieOpts(user.exp - Date.now()));
    await this.prisma.user.update({
      where: { id: user.id },
      data: { defaultAdoOrg: body.org },
    });
    return { selected: body.org };
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
