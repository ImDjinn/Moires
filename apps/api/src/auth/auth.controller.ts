import { Controller, Get, Post, Body, Req, Res, HttpCode, HttpException, BadRequestException, UnauthorizedException } from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { signedCookieOpts, plainCookieOpts, clearCookieOpts } from "./cookies";
import { ADO_ORG_RE } from "./org";

const H = 60 * 60 * 1000;

// Anti-brute-force du login : 10 échecs / 15 min par IP.
// ponytail: compteur en mémoire, par instance — @nestjs/throttler si multi-instance.
const failedLogins = new Map<string, { count: number; reset: number }>();
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;

function isRateLimited(ip: string): boolean {
  const a = failedLogins.get(ip);
  if (!a || Date.now() > a.reset) return false;
  return a.count >= MAX_FAILURES;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const a = failedLogins.get(ip);
  if (!a || now > a.reset) failedLogins.set(ip, { count: 1, reset: now + WINDOW_MS });
  else a.count++;
}

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
      const user = JSON.parse(cookie);
      // Expiration portée par le contenu signé : un cookie volé n'est pas
      // réutilisable indéfiniment (maxAge n'est appliqué que par le navigateur).
      if (typeof user.exp !== "number" || Date.now() > user.exp) {
        res.status(401).send();
        return;
      }
      res.json(user);
    } catch {
      res.status(401).send();
    }
  }

  // Connexion par PAT Azure DevOps : le PAT est validé contre son organisation
  // puis stocké dans le cookie ado_token, utilisé comme credential ADO par toutes
  // les routes en aval. L'org validée est posée dans ado_org. PAT/org invalide → 401.
  @Post("login")
  @HttpCode(204)
  async login(@Body() body: { pat?: string; org?: string }, @Req() req: Request, @Res() res: Response) {
    const pat = body?.pat?.trim();
    const org = body?.org?.trim();
    if (!pat || !org) throw new BadRequestException("pat and org are required");
    // L'org est interpolée dans les URLs ADO : format strict avant tout appel.
    if (!ADO_ORG_RE.test(org)) throw new BadRequestException("Invalid organization name");
    const ip = req.ip ?? "unknown";
    if (isRateLimited(ip)) throw new HttpException("Too many login attempts", 429);
    let user, token: string, validatedOrg: string;
    try {
      ({ user, pat: token, org: validatedOrg } = await this.authService.loginWithPat(pat, org));
    } catch {
      // PAT invalide, org inconnue, ou PAT sans accès à cette org.
      recordFailure(ip);
      throw new UnauthorizedException("Invalid PAT or organization");
    }
    res.cookie(
      "session_user",
      JSON.stringify({ id: user.id, displayName: user.displayName, exp: Date.now() + 8 * H }),
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
