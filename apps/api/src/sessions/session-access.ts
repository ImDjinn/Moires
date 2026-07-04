import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../database/redis.service";

// Un utilisateur accède à une session s'il l'a créée (persistant en base) ou
// s'il en est participant courant (présent dans Redis, ajouté au join WS).
// ponytail: pas de table de membres — createdBy + participants suffit tant qu'il
// n'existe pas de flux d'invitation ; ajouter une table `SessionMember` le jour
// où l'on partage une session à des utilisateurs qui ne l'ont pas créée.
export async function isSessionMember(
  prisma: PrismaService,
  redis: RedisService,
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const session = await prisma.planningSession.findUnique({
    where: { id: sessionId },
    select: { createdBy: true },
  });
  if (!session) return false;
  if (session.createdBy === userId) return true;
  const participants = await redis.getParticipants(sessionId);
  return participants.includes(userId);
}

@Injectable()
export class SessionMemberGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = (req as any).user as { id?: string } | undefined;
    const raw = req.params?.id;
    const sessionId = typeof raw === "string" ? raw : undefined;
    if (!user?.id || !sessionId) throw new ForbiddenException();
    if (!(await isSessionMember(this.prisma, this.redis, sessionId, user.id))) {
      throw new ForbiddenException("Not a member of this session");
    }
    return true;
  }
}
