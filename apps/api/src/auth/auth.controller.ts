import { Controller, Get, Post, Query, Req, Res, HttpCode } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { signedCookieOpts, plainCookieOpts } from "./cookies";

const H = 60 * 60 * 1000;

@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

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

  @Get("login")
  async login(@Res() res: Response) {
    const url = await this.authService.getLoginUrl();
    res.redirect(url);
  }

  @Get("callback")
  async callback(
    @Query("code") code: string,
    @Query("error") error: string,
    @Query("error_description") errorDesc: string,
    @Res() res: Response,
  ) {
    if (error) {
      console.error(`OAuth error: ${error} - ${errorDesc}`);
      this.redirectWithError(res, this.extractAadCode(errorDesc) ?? error);
      return;
    }
    let user, accessToken;
    try {
      ({ user, accessToken } = await this.authService.handleCallback(code));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`OAuth callback failed: ${message}`);
      this.redirectWithError(res, this.extractAadCode(message) ?? "auth_failed");
      return;
    }
    res.cookie(
      "session_user",
      JSON.stringify({ id: user.id, displayName: user.displayName }),
      signedCookieOpts(8 * H),
    );
    res.cookie("ado_token", accessToken, plainCookieOpts(H));
    if (user.defaultAdoOrg) {
      res.cookie("ado_org", user.defaultAdoOrg, signedCookieOpts(8 * H));
    }
    res.redirect(this.config.get<string>("FRONTEND_URL")!);
  }

  // Surface a precise AAD sub-code (e.g. AADSTS650052) when present, so the
  // frontend can show an actionable message instead of a generic "invalid_client".
  private extractAadCode(text?: string): string | null {
    return text?.match(/AADSTS\d+/)?.[0] ?? null;
  }

  private redirectWithError(res: Response, code: string) {
    res.redirect(`${this.config.get<string>("FRONTEND_URL")}?auth_error=${encodeURIComponent(code)}`);
  }

  @Post("refresh")
  @HttpCode(204)
  async refresh(@Req() req: Request, @Res() res: Response) {
    const token = req.cookies?.ado_token;
    if (!token) {
      res.status(401).send();
      return;
    }
    const newToken = await this.authService.refreshToken(token);
    res.cookie("ado_token", newToken, plainCookieOpts(H));
    res.status(204).send();
  }
}
