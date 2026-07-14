import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../database/prisma.service";

// Un utilisateur accède à une session s'il l'a créée, ou si son organisation ADO
// validée (cookie signé ado_org, posé au login) est celle de la session : l'id
// de session (UUID non devinable) sert de lien d'invitation au sein de l'org.
// ponytail: pas de table de membres — ajouter une table `SessionMember` le jour
// où il faut des invitations nominatives plus fines que l'org.
export async function isSessionMember(
  prisma: PrismaService,
  sessionId: string,
  userId: string,
  org: string | undefined,
): Promise<boolean> {
  const session = await prisma.planningSession.findUnique({
    where: { id: sessionId },
    select: { createdBy: true, adoOrg: true },
  });
  if (!session) return false;
  return session.createdBy === userId || (!!org && session.adoOrg === org);
}

@Injectable()
export class SessionMemberGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = (req as any).user as { id?: string } | undefined;
    const raw = req.params?.id;
    const sessionId = typeof raw === "string" ? raw : undefined;
    if (!user?.id || !sessionId) throw new ForbiddenException();
    const org = req.signedCookies?.ado_org as string | undefined;
    if (!(await isSessionMember(this.prisma, sessionId, user.id, org))) {
      throw new ForbiddenException("Not a member of this session");
    }
    return true;
  }
}
