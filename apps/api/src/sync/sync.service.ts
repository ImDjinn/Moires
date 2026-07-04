import { Injectable } from "@nestjs/common";
import type { Ticket, TeamMember, SessionSnapshot } from "@moirai/shared";
import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../database/redis.service";
import { CapacitiesRepo } from "../database/capacities.repo";
import { AdoService } from "../ado/ado.service";
import { AdoMapper } from "../ado/ado.mapper";

@Injectable()
export class SyncService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private capacities: CapacitiesRepo,
    private ado: AdoService,
    private mapper: AdoMapper,
  ) {}

  async syncInitial(
    sessionId: string,
    org: string,
    projectId: string,
    iterationIds: string[],
    token: string,
    areaPaths?: string[],
  ): Promise<{ tickets: Ticket[]; teamMembers: TeamMember[] }> {
    const ids = await this.ado.queryWorkItemIds(org, projectId, iterationIds, token, areaPaths);
    const rawItems = ids.length ? await this.ado.getWorkItemsBatch(org, ids, token) : [];
    const tickets = rawItems.map((r) => this.mapper.toTicket(r));

    const epics = rawItems.length ? await this.ado.resolveEpics(org, rawItems, token) : new Map();
    for (const t of tickets) {
      const epic = epics.get(t.id);
      if (epic) {
        t.epicId = epic.id;
        t.epicTitle = epic.title;
      }
    }

    // Récupère les Epics complets (dates/état/priorité) pour les afficher comme
    // niveau racine du Release planning, s'ils ne sont pas déjà dans le lot.
    const present = new Set(tickets.map((t) => t.id));
    const epicIds = [...new Set([...epics.values()].map((e: { id: string }) => e.id))].filter((id) => !present.has(id));
    if (epicIds.length) {
      const rawEpics = await this.ado.getWorkItemsBatch(org, epicIds, token);
      tickets.push(...rawEpics.map((r) => this.mapper.toTicket(r)));
    }

    await this.redis.setTickets(sessionId, tickets);

    for (const t of tickets) {
      await this.prisma.ticketsCache.upsert({
        where: { id: t.id },
        update: {
          sessionId,
          title: t.title,
          workItemType: t.workItemType,
          parentId: t.parentId,
          state: t.state,
          tags: t.tags,
          assigneeId: t.assigneeId,
          areaPath: t.areaPath,
          iterationId: t.iterationId,
          epicId: t.epicId,
          epicTitle: t.epicTitle,
          startDate: new Date(t.startDate),
          endDate: new Date(t.endDate),
          targetDate: t.targetDate ? new Date(t.targetDate) : null,
          estimateHours: t.estimateHours,
          storyPoints: t.storyPoints,
          adoRev: t.adoRev,
          syncStatus: t.syncStatus,
        },
        create: {
          id: t.id,
          sessionId,
          title: t.title,
          workItemType: t.workItemType,
          parentId: t.parentId,
          state: t.state,
          tags: t.tags,
          assigneeId: t.assigneeId,
          areaPath: t.areaPath,
          iterationId: t.iterationId,
          epicId: t.epicId,
          epicTitle: t.epicTitle,
          startDate: new Date(t.startDate),
          endDate: new Date(t.endDate),
          targetDate: t.targetDate ? new Date(t.targetDate) : null,
          estimateHours: t.estimateHours,
          storyPoints: t.storyPoints,
          adoRev: t.adoRev,
          syncStatus: t.syncStatus,
        },
      });
    }

    let teamMembers = iterationIds.length
      ? await this.ado.getCapacities(org, projectId, iterationIds[0], token)
      : [];

    // ponytail: fallback quand aucune capacité configurée dans ADO
    if (!teamMembers.length) {
      teamMembers = await this.ado.getTeamMembers(org, projectId, token);
    }

    // Colonnes Daily : les vraies colonnes des boards d'équipe ADO (avec leur
    // mapping colonne → état pour le writeback). Les types sans board (Task :
    // taskboard) retombent sur leurs états.
    const boardCols = await this.ado.getBoardColumns(org, projectId, token);
    const covered = new Set(boardCols.map((c) => c.type));
    const backlogTypes = await this.ado.getBacklogTypes(org, projectId, token);
    const rest = [
      ...new Set([...backlogTypes, ...tickets.map((t) => t.workItemType)]),
    ].filter((t) => t && !covered.has(t));
    const states = rest.length ? await this.ado.getStates(org, projectId, rest, token) : [];
    await this.redis.setStates(sessionId, [...boardCols, ...states]);

    return { tickets, teamMembers };
  }

  async syncIncremental(sessionId: string, token: string): Promise<SessionSnapshot> {
    const session = await this.prisma.planningSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    const { tickets, teamMembers } = await this.syncInitial(
      sessionId,
      session.adoOrg,
      session.adoProjectId,
      session.adoIterationIds,
      token,
      session.areaPaths.length ? session.areaPaths : undefined,
    );

    const presences = await this.redis.getPresences(sessionId);
    const iterations = await this.redis.getIterations(sessionId);
    const capacities = await this.capacities.list(session.adoProjectId, teamMembers);
    const states = await this.redis.getStates(sessionId);

    return { sessionId, tickets, participants: presences, teamMembers, iterations, capacities, states };
  }
}
