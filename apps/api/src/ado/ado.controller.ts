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
import { AuthGuard } from "../auth/auth.guard";
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
  private async getToken(req: Request): Promise<string> {
    const user = (req as any).user;
    return (await this.redis.getUserPat(user.id)) ?? "";
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
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body?.org) throw new BadRequestException("org is required");
    // L'org est interpolée dans les URLs ADO par toutes les routes en aval.
    if (!ADO_ORG_RE.test(body.org)) throw new BadRequestException("Invalid organization name");
    const user = (req as any).user;
    res.cookie("ado_org", body.org, signedCookieOpts(8 * 60 * 60 * 1000));
    if (user?.id) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { defaultAdoOrg: body.org },
      });
    }
    return { selected: body.org };
  }

  @Get("projects")
  async getProjects(@Req() req: Request) {
    return this.ado.getProjects(this.getOrg(req), await this.getToken(req));
  }

  @Get("projects/:id/iterations")
  async getIterations(@Param("id") id: string, @Req() req: Request) {
    return this.ado.getIterations(this.getOrg(req), id, await this.getToken(req));
  }

  @Get("projects/:id/areas")
  async getAreas(@Param("id") id: string, @Req() req: Request) {
    return this.ado.getAreas(this.getOrg(req), id, await this.getToken(req));
  }

  @Get("projects/:id/team-members")
  async getTeamMembers(@Param("id") id: string, @Req() req: Request) {
    return this.ado.getTeamMembers(this.getOrg(req), id, await this.getToken(req));
  }
}
