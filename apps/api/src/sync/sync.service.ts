import { Injectable, Logger } from "@nestjs/common";
import type { Ticket, TeamMember, SessionSnapshot, Iteration } from "@moirai/shared";
import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../database/redis.service";
import { CapacitiesRepo } from "../database/capacities.repo";
import { AdoService } from "../ado/ado.service";
import { AdoMapper, RawAdoWorkItem } from "../ado/ado.mapper";

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private capacities: CapacitiesRepo,
    private ado: AdoService,
    private mapper: AdoMapper,
  ) {}

  /** Itérations datées du projet, triées par date de début croissante. */
  async resolveIterations(org: string, projectId: string, token: string): Promise<Iteration[]> {
    const raw = await this.ado.getIterations(org, projectId, token);
    return raw
      .filter((i) => i.startDate && i.finishDate)
      .map((i) => ({
        id: i.id,
        name: i.name,
        path: i.path,
        startDate: i.startDate,
        finishDate: i.finishDate,
      }))
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

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

    // Un seul aller-retour transactionnel au lieu de N upserts séquentiels
    // (à chaque sync, y compris le sync incrémental toutes les 30s).
    // Écrit hors chemin critique (pas de await) : Redis est la source de
    // vérité de la session, ce cache ne sert qu'au mapping work item → session
    // du webhook ADO — une écriture en retard ou perdue est sans effet visible.
    const fields = (t: Ticket) => ({
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
    });
    void this.prisma
      .$transaction(
        tickets.map((t) =>
          this.prisma.ticketsCache.upsert({
            where: { id: t.id },
            update: fields(t),
            create: { id: t.id, ...fields(t) },
          }),
        ),
      )
      .catch((e) => this.logger.warn(`ticketsCache write failed for session ${sessionId}: ${e}`));

    return { tickets, rawItems };
  }

  async syncInitial(
    sessionId: string,
    org: string,
    projectId: string,
    iterationIds: string[],
    token: string,
    areaPaths?: string[],
    iterationPaths?: string[],
  ): Promise<{ tickets: Ticket[]; teamMembers: TeamMember[] }> {
    // Référentiels indépendants des tickets, chargés en parallèle du sync :
    // chaque await séquentiel est un aller-retour ADO de plus sur le chemin
    // critique de l'ouverture de session.
    const [{ tickets, rawItems }, caps, roster, boardCols, backlogTypes] = await Promise.all([
      this.syncTickets(sessionId, org, projectId, iterationIds, token, areaPaths, iterationPaths),
      iterationIds.length
        ? this.ado.getCapacities(org, projectId, iterationIds[0], token)
        : Promise.resolve([] as TeamMember[]),
      this.ado.getTeamMembers(org, projectId, token),
      this.ado.getBoardColumns(org, projectId, token),
      this.ado.getBacklogTypes(org, projectId, token),
    ]);

    // teamMembers = union dédupliquée de trois sources, sinon les assignés hors
    // capacités retombaient tous en « Non assigné » et le roster restait partiel :
    //  1. roster d'équipe (collaborateurs sans ticket),
    //  2. assignés réels des tickets (garantit qu'un assigné apparaît toujours),
    //  3. capacités configurées (heures/jour réelles quand renseignées).
    const capById = new Map(caps.map((c) => [c.id, c.capacityHoursPerDay]));
    const byId = new Map<string, TeamMember>();
    const add = (id: string | null | undefined, displayName: string) => {
      if (!id || byId.has(id)) return;
      byId.set(id, { id, displayName: displayName || id, capacityHoursPerDay: capById.get(id) ?? 8 });
    };
    for (const m of roster) add(m.id, m.displayName);
    for (const r of rawItems) {
      const a = r.fields["System.AssignedTo"] as { uniqueName?: string; id?: string; displayName?: string } | undefined;
      if (a) add(a.uniqueName || a.id, a.displayName || "");
    }
    for (const c of caps) add(c.id, c.displayName);
    const teamMembers = [...byId.values()];

    // Colonnes Daily : les vraies colonnes des boards d'équipe ADO (avec leur
    // mapping colonne → état pour le writeback). Les types sans board (Task :
    // taskboard) retombent sur leurs états.
    const covered = new Set(boardCols.map((c) => c.type));
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

    let iterations = await this.redis.getIterations(sessionId);
    let teamMembers = await this.redis.getTeamMembers(sessionId);
    let tickets: Ticket[];

    // Anti-throttling ADO : 1 sync ADO max par fenêtre de 30s par session,
    // tous clients confondus. Les polls intermédiaires reçoivent le cache
    // Redis, tenu à jour par les ops WebSocket ; un webhook ADO supprime ce
    // créneau (clearSyncSlot) pour forcer un vrai sync au prochain poll.
    if (await this.redis.acquireSyncSlot(sessionId, 30)) {
      if (!iterations.length) {
        // Cache Redis expiré (TTL 24h) : ré-hydratation complète comme à la
        // création — sinon la session restaurée paraît vide (tickets [], équipe
        // et états absents) et le front conclut à tort « aucun work item ».
        iterations = await this.resolveIterations(session.adoOrg, session.adoProjectId, token);
        const res = await this.syncInitial(
          sessionId,
          session.adoOrg,
          session.adoProjectId,
          iterations.map((i) => i.id),
          token,
          session.areaPaths.length ? session.areaPaths : undefined,
          iterations.map((i) => i.path),
        );
        tickets = res.tickets;
        teamMembers = res.teamMembers;
        await Promise.all([
          this.redis.setIterations(sessionId, iterations),
          this.redis.setTeamMembers(sessionId, teamMembers),
        ]);
      } else {
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
      }
    } else {
      tickets = await this.redis.getTickets(sessionId);
    }

    const presences = await this.redis.getPresences(sessionId);
    const capacities = await this.capacities.list(session.adoProjectId, teamMembers);
    const states = await this.redis.getStates(sessionId);

    return { sessionId, tickets, participants: presences, teamMembers, iterations, capacities, states };
  }
}
