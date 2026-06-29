import { Controller, Get, Post, Query, Req, Res, HttpCode } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

  @Get("me")
  me(@Req() req: Request, @Res() res: Response) {
    const cookie = req.cookies?.session_user;
    if (!cookie) {
      res.status(401).send();
      return;
    }
    try {
      const user = typeof cookie === "string" ? JSON.parse(cookie) : cookie;
      res.json(user);
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
    res.cookie("session_user", JSON.stringify({ id: user.id, displayName: user.displayName }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000, // 8h
    });
    res.cookie("ado_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 1000, // 1h
    });
    if (user.defaultAdoOrg) {
      res.cookie("ado_org", user.defaultAdoOrg, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 8 * 60 * 60 * 1000, // 8h
      });
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
    res.cookie("ado_token", newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 1000,
    });
    res.status(204).send();
  }
}
