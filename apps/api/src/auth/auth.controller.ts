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
    @Res() res: Response,
  ) {
    const { user, accessToken } = await this.authService.handleCallback(code);
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
    res.redirect(this.config.get<string>("FRONTEND_URL")!);
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
