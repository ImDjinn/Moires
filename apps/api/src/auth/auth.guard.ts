import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";

export interface AuthenticatedUser {
  id: string;
  displayName: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const cookie = req.cookies?.session_user;
    if (!cookie) throw new UnauthorizedException();
    try {
      const user: AuthenticatedUser = typeof cookie === "string" ? JSON.parse(cookie) : cookie;
      (req as any).user = user;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
