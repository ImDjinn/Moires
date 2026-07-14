import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedUser } from "./auth.guard";

/** Identité posée sur la requête par l'AuthGuard — remplace les (req as any).user. */
export const User = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => ctx.switchToHttp().getRequest().user,
);
