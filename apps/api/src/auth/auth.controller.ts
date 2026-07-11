import { Controller, Get, Post, Body, Req, Res, HttpCode, HttpException, BadRequestException, UnauthorizedException } from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { RedisService } from "../database/redis.service";
import { signedCookieOpts, clearCookieOpts } from "./cookies";
import { ADO_ORG_RE } from "./org";

const H = 60 * 60 * 1000;

// Anti-brute-force du login : 10 échecs / 15 min par IP.
// ponytail: compteur en mémoire, par instance — @nestjs/throttler si multi-instance.
const failedLogins = new Map<string, { count: number; reset: number }>();
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;

function isRateLimited(ip: string): boolean {
  const a = failedLogins.get(ip);
  if (!a) return false;
  if (Date.now() > a.reset) {
    failedLogins.delete(ip);
    return false;
  }
  return a.count >= MAX_FAILURES;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  // Purge des fenêtres expirées : borne la mémoire sous un flood d'IPs.
  if (failedLogins.size >= 10_000) {
    for (const [k, v] of failedLogins) if (now > v.reset) failedLogins.delete(k);
  }
  const a = failedLogins.get(ip);
  if (!a || now > a.reset) failedLogins.set(ip, { count: 1, reset: now + WINDOW_MS });
  else a.count++;
}

@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private redis: RedisService,
  ) {}

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
  // puis stocké chiffré côté serveur (Redis, TTL = durée de session) — jamais
  // dans un cookie navigateur. L'org validée est posée dans ado_org (signé).
  @Post("login")
  @HttpCode(204)
  async login(
    @Body() body: { pat?: string; org?: string; remember?: boolean },
    @Req() req: Request,
    @Res() res: Response,
  ) {
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
    // « Se souvenir de moi » : 30 jours au lieu de 8 h. Le PAT expire de toute
    // façon côté ADO, indépendamment de la durée du cookie.
    const ttl = body?.remember === true ? 30 * 24 * H : 8 * H;
    await this.redis.setUserPat(user.id, token, Math.floor(ttl / 1000));
    res.cookie(
      "session_user",
      JSON.stringify({ id: user.id, displayName: user.displayName, exp: Date.now() + ttl }),
      signedCookieOpts(ttl),
    );
    res.cookie("ado_org", validatedOrg, signedCookieOpts(ttl));
    res.status(204).send();
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res() res: Response) {
    // Supprime le PAT chiffré côté serveur : sans ça, le writeback pourrait
    // continuer à écrire dans ADO après la déconnexion.
    const cookie = req.signedCookies?.session_user;
    if (typeof cookie === "string") {
      try {
        const { id } = JSON.parse(cookie);
        if (typeof id === "string") await this.redis.deleteUserPat(id);
      } catch {
        /* cookie illisible : rien à purger */
      }
    }
    res.clearCookie("session_user", clearCookieOpts());
    // ado_token : legacy (le PAT ne vit plus en cookie) — purge les sessions d'avant.
    res.clearCookie("ado_token", clearCookieOpts());
    res.clearCookie("ado_org", clearCookieOpts());
    res.status(204).send();
  }
}
