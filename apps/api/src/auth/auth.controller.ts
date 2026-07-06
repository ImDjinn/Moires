import { Controller, Get, Post, Body, Req, Res, HttpCode, BadRequestException, UnauthorizedException } from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { signedCookieOpts, plainCookieOpts, clearCookieOpts } from "./cookies";

const H = 60 * 60 * 1000;

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get("me")
  me(@Req() req: Request, @Res() res: Response) {
    const cookie = req.signedCookies?.session_user;
    if (typeof cookie !== "string") {
      res.status(401).send();
      return;
    }
    try {
      res.json(JSON.parse(cookie));
    } catch {
      res.status(401).send();
    }
  }

  // Connexion par PAT Azure DevOps : le PAT est validé contre son organisation
  // puis stocké dans le cookie ado_token, utilisé comme credential ADO par toutes
  // les routes en aval. L'org validée est posée dans ado_org. PAT/org invalide → 401.
  @Post("login")
  @HttpCode(204)
  async login(@Body() body: { pat?: string; org?: string }, @Res() res: Response) {
    const pat = body?.pat?.trim();
    const org = body?.org?.trim();
    if (!pat || !org) throw new BadRequestException("pat and org are required");
    let user, token: string, validatedOrg: string;
    try {
      ({ user, pat: token, org: validatedOrg } = await this.authService.loginWithPat(pat, org));
    } catch {
      // PAT invalide, org inconnue, ou PAT sans accès à cette org.
      throw new UnauthorizedException("Invalid PAT or organization");
    }
    res.cookie(
      "session_user",
      JSON.stringify({ id: user.id, displayName: user.displayName }),
      signedCookieOpts(8 * H),
    );
    res.cookie("ado_token", token, plainCookieOpts(8 * H));
    res.cookie("ado_org", validatedOrg, signedCookieOpts(8 * H));
    res.status(204).send();
  }

  @Post("logout")
  @HttpCode(204)
  logout(@Res() res: Response) {
    res.clearCookie("session_user", clearCookieOpts());
    res.clearCookie("ado_token", clearCookieOpts());
    res.clearCookie("ado_org", clearCookieOpts());
    res.status(204).send();
  }
}
