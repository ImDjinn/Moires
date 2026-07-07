import { Injectable } from "@nestjs/common";
import type { Ticket, TeamMember, SessionSnapshot } from "@moirai/shared";
import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../database/redis.service";
import { CapacitiesRepo } from "../database/capacities.repo";
import { AdoService } from "../ado/ado.service";
import { AdoMapper, RawAdoWorkItem } from "../ado/ado.mapper";

@Injectable()
export class SyncService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private capacities: CapacitiesRepo,
    private ado: AdoService,
    private mapper: AdoMapper,
  ) {}

  /**
   * Sync des tickets seuls (WIQL + batch + epics) : la partie répétable du
   * sync, ~3 requêtes ADO. Les référentiels semi-statiques (équipe, boards,
   * états, capacités) ne sont chargés que par syncInitial.
   */
  private async syncTickets(
    sessionId: string,
    org: string,
    projectId: string,
    iterationIds: string[],
    token: string,
    areaPaths?: string[],
    iterationPaths?: string[],
  ): Promise<{ tickets: Ticket[]; rawItems: RawAdoWorkItem[] }> {
    const ids = await this.ado.queryWorkItemIds(org, projectId, iterationIds, token, areaPaths, iterationPaths);
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

    return { tickets, rawItems };
  }

  async syncInitial(
    sessionId: string,
    org: string,
    projectId: string,
    iterationIds: string[],
    token: string,
    areaPaths?: string[],
  ): Promise<{ tickets: Ticket[]; teamMembers: TeamMember[] }> {
    const { tickets, rawItems } = await this.syncTickets(sessionId, org, projectId, iterationIds, token, areaPaths);

    // teamMembers = union dédupliquée de trois sources, sinon les assignés hors
    // capacités retombaient tous en « Non assigné » et le roster restait partiel :
    //  1. roster d'équipe (collaborateurs sans ticket),
    //  2. assignés réels des tickets (garantit qu'un assigné apparaît toujours),
    //  3. capacités configurées (heures/jour réelles quand renseignées).
    const caps = iterationIds.length
      ? await this.ado.getCapacities(org, projectId, iterationIds[0], token)
      : [];
    const capById = new Map(caps.map((c) => [c.id, c.capacityHoursPerDay]));
    const byId = new Map<string, TeamMember>();
    const add = (id: string | null | undefined, displayName: string) => {
      if (!id || byId.has(id)) return;
      byId.set(id, { id, displayName: displayName || id, capacityHoursPerDay: capById.get(id) ?? 8 });
    };
    for (const m of await this.ado.getTeamMembers(org, projectId, token)) add(m.id, m.displayName);
    for (const r of rawItems) {
      const a = r.fields["System.AssignedTo"] as { uniqueName?: string; id?: string; displayName?: string } | undefined;
      if (a) add(a.uniqueName || a.id, a.displayName || "");
    }
    for (const c of caps) add(c.id, c.displayName);
    const teamMembers = [...byId.values()];

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

    const iterations = await this.redis.getIterations(sessionId);
    const teamMembers = await this.redis.getTeamMembers(sessionId);
    let tickets: Ticket[];

    // Anti-throttling ADO : 1 sync ADO max par fenêtre de 30s par session,
    // tous clients confondus. Les polls intermédiaires reçoivent le cache
    // Redis, déjà tenu à jour par les ops WebSocket et les webhooks ADO.
    if (await this.redis.acquireSyncSlot(sessionId, 30)) {
      const paths = iterations.map((i) => i.path);
      const res = await this.syncTickets(
        sessionId,
        session.adoOrg,
        session.adoProjectId,
        session.adoIterationIds,
        token,
        session.areaPaths.length ? session.areaPaths : undefined,
        paths.length ? paths : undefined,
      );
      tickets = res.tickets;

      // Nouveaux assignés apparus depuis le sync initial — ajoutés depuis les
      // work items déjà chargés, sans appel ADO supplémentaire.
      const known = new Set(teamMembers.map((m) => m.id));
      let grew = false;
      for (const r of res.rawItems) {
        const a = r.fields["System.AssignedTo"] as { uniqueName?: string; id?: string; displayName?: string } | undefined;
        const id = a?.uniqueName || a?.id;
        if (id && !known.has(id)) {
          teamMembers.push({ id, displayName: a?.displayName || id, capacityHoursPerDay: 8 });
          known.add(id);
          grew = true;
        }
      }
      if (grew) await this.redis.setTeamMembers(sessionId, teamMembers);
    } else {
      tickets = await this.redis.getTickets(sessionId);
    }

    const presences = await this.redis.getPresences(sessionId);
    const capacities = await this.capacities.list(session.adoProjectId, teamMembers);
    const states = await this.redis.getStates(sessionId);

    return { sessionId, tickets, participants: presences, teamMembers, iterations, capacities, states };
  }
}
