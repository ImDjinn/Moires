import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";

export interface AuthenticatedUser {
  id: string;
  displayName: string;
  // Expiration (epoch ms) embarquée dans le contenu signé : la signature seule
  // n'expire jamais, maxAge n'est appliqué que par le navigateur.
  exp: number;
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
      if (typeof user.exp !== "number" || Date.now() > user.exp) throw new Error("expired");
      (req as any).user = user;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
