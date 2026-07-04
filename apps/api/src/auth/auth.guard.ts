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
    // Uniquement req.signedCookies : un cookie session_user forgé (non signé ou
    // signature invalide) n'y figure pas → identité impossible à usurper.
    const cookie = (req as any).signedCookies?.session_user;
    if (typeof cookie !== "string") throw new UnauthorizedException();
    try {
      const user: AuthenticatedUser = JSON.parse(cookie);
      (req as any).user = user;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
