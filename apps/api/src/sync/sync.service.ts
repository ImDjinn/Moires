import { Injectable } from "@nestjs/common";
import type { Ticket, TeamMember, SessionSnapshot } from "@moires/shared";
import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../database/redis.service";
import { AdoService } from "../ado/ado.service";
import { AdoMapper } from "../ado/ado.mapper";

@Injectable()
export class SyncService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private ado: AdoService,
    private mapper: AdoMapper,
  ) {}

  async syncInitial(
    sessionId: string,
    projectId: string,
    iterationIds: string[],
    token: string,
    areaPaths?: string[],
  ): Promise<{ tickets: Ticket[]; teamMembers: TeamMember[] }> {
    const ids = await this.ado.queryWorkItemIds(projectId, iterationIds, token, areaPaths);
    const rawItems = ids.length ? await this.ado.getWorkItemsBatch(ids, token) : [];
    const tickets = rawItems.map((r) => this.mapper.toTicket(r));

    await this.redis.setTickets(sessionId, tickets);

    for (const t of tickets) {
      await this.prisma.ticketsCache.upsert({
        where: { id: t.id },
        update: {
          sessionId,
          title: t.title,
          assigneeId: t.assigneeId,
          areaPath: t.areaPath,
          iterationId: t.iterationId,
          startDate: new Date(t.startDate),
          endDate: new Date(t.endDate),
          estimateHours: t.estimateHours,
          adoRev: t.adoRev,
          syncStatus: t.syncStatus,
        },
        create: {
          id: t.id,
          sessionId,
          title: t.title,
          assigneeId: t.assigneeId,
          areaPath: t.areaPath,
          iterationId: t.iterationId,
          startDate: new Date(t.startDate),
          endDate: new Date(t.endDate),
          estimateHours: t.estimateHours,
          adoRev: t.adoRev,
          syncStatus: t.syncStatus,
        },
      });
    }

    const teamMembers = iterationIds.length
      ? await this.ado.getCapacities(projectId, iterationIds[0], token)
      : [];

    return { tickets, teamMembers };
  }

  async syncIncremental(sessionId: string, token: string): Promise<SessionSnapshot> {
    const session = await this.prisma.planningSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    const { tickets, teamMembers } = await this.syncInitial(
      sessionId,
      session.adoProjectId,
      session.adoIterationIds,
      token,
      session.areaPaths.length ? session.areaPaths : undefined,
    );

    const presences = await this.redis.getPresences(sessionId);

    return { sessionId, tickets, participants: presences, teamMembers };
  }
}
