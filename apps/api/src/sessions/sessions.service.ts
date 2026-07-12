import { Injectable } from "@nestjs/common";
import type { CreateSessionDto, SessionSnapshot, Operation, Ticket, Iteration, Capacity, MemberMeta } from "@moirai/shared";
import { setTicketField, getTicketField } from "@moirai/shared";
import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../database/redis.service";
import { CapacitiesRepo } from "../database/capacities.repo";
import { MemberMetaRepo } from "../database/member-meta.repo";
import { AdoService } from "../ado/ado.service";
import { AdoMapper } from "../ado/ado.mapper";
import { SyncService } from "../sync/sync.service";
import { WritebackService } from "../writeback/writeback.service";

@Injectable()
export class SessionsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private capacities: CapacitiesRepo,
    private memberMeta: MemberMetaRepo,
    private ado: AdoService,
    private mapper: AdoMapper,
    private syncService: SyncService,
    private writebackService: WritebackService,
  ) {}

  async createSession(
    dto: CreateSessionDto,
    userId: string,
    org: string,
    token: string,
  ): Promise<SessionSnapshot> {
    // Le lobby ne choisit plus les itérations : on charge toutes les itérations
    // datées du projet, dans l'ordre chronologique.
    const iterations = await this.resolveIterations(org, dto.adoProjectId, token);
    const iterationIds = iterations.map((i) => i.id);

    const session = await this.prisma.planningSession.create({
      data: {
        adoOrg: org,
        adoProjectId: dto.adoProjectId,
        adoIterationIds: iterationIds,
        areaPaths: dto.areaPaths || [],
        createdBy: userId,
      },
    });

    // Sync initial et amorce des capacités en parallèle (le seed ne dépend que
    // des itérations, déjà résolues) ; les chemins d'itération sont transmis
    // pour épargner un getIterations redondant dans la requête WIQL.
    const [{ tickets, teamMembers }] = await Promise.all([
      this.syncService.syncInitial(
        session.id,
        org,
        dto.adoProjectId,
        iterationIds,
        token,
        dto.areaPaths,
        iterations.map((i) => i.path),
      ),
      this.seedCapacities(dto.adoProjectId, iterations, token, org),
    ]);

    await Promise.all([
      this.redis.setIterations(session.id, iterations),
      this.redis.setTeamMembers(session.id, teamMembers),
      this.redis.addParticipant(session.id, userId),
    ]);

    const capacities = await this.capacities.list(dto.adoProjectId, teamMembers);

    return {
      sessionId: session.id,
      tickets,
      participants: [],
      teamMembers,
      iterations,
      capacities,
      states: await this.redis.getStates(session.id),
      adoUrl: `https://dev.azure.com/${org}/${dto.adoProjectId}`,
    };
  }

  /**
   * Amorce en base les capacités depuis ADO (jours ouvrés − jours off équipe/
   * membre) sans écraser les saisies déjà persistées. Itérations courantes et
   * futures uniquement (la capacité des sprints passés n'est pas éditée).
   * L'état courant est relu ensuite via capacities.list (l'équipe n'est connue
   * qu'après le sync initial, exécuté en parallèle).
   */
  private async seedCapacities(
    projectId: string,
    iterations: Iteration[],
    token: string,
    org: string,
  ): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = iterations.filter((it) => it.finishDate.slice(0, 10) >= today);
    const perIter = await Promise.all(
      upcoming.map(async (it) => {
        try {
          const days = await this.ado.getCapacityDays(org, projectId, it.id, it.startDate, it.finishDate, token);
          return days.map((d) => ({ memberId: d.memberId, iterationPath: it.path, storyPoints: d.days }));
        } catch {
          return []; // capacité ADO non configurée pour cette itération
        }
      }),
    );
    await this.capacities.seed(projectId, perIter.flat());
  }

  /** Itérations datées du projet, triées par date de début croissante. */
  private async resolveIterations(
    org: string,
    projectId: string,
    token: string,
  ): Promise<Iteration[]> {
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

  async getSnapshot(sessionId: string): Promise<SessionSnapshot> {
    const [tickets, presences, iterations, teamMembers, states, session] = await Promise.all([
      this.redis.getTickets(sessionId),
      this.redis.getPresences(sessionId),
      this.redis.getIterations(sessionId),
      this.redis.getTeamMembers(sessionId),
      this.redis.getStates(sessionId),
      this.prisma.planningSession.findUnique({ where: { id: sessionId } }),
    ]);
    // Capacités + poste/rôle persistés par projet (pas par session) — remappés sur l'équipe courante.
    const [capacities, memberMeta] = session
      ? await Promise.all([
          this.capacities.list(session.adoProjectId, teamMembers),
          this.memberMeta.list(session.adoProjectId, teamMembers),
        ])
      : [[], []];
    return {
      sessionId, tickets, participants: presences, teamMembers, iterations, capacities, memberMeta, states,
      adoUrl: session ? `https://dev.azure.com/${session.adoOrg}/${session.adoProjectId}` : undefined,
    };
  }

  /** Duplique un ticket : crée le work item copié dans ADO et l'ajoute à la session. */
  async duplicateTicket(sessionId: string, ticketId: string, token: string): Promise<Ticket> {
    const src = await this.redis.getTicket(sessionId, ticketId);
    if (!src) throw new Error(`Ticket ${ticketId} not found`);
    const session = await this.prisma.planningSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const patches: { op: "add"; path: string; value: unknown }[] = [
      { op: "add", path: "/fields/System.Title", value: `${src.title} - Copy` },
    ];
    const addIf = (cond: unknown, path: string, value: unknown) => {
      if (cond) patches.push({ op: "add", path, value });
    };
    addIf(src.iterationId, "/fields/System.IterationPath", src.iterationId);
    addIf(src.areaPath, "/fields/System.AreaPath", src.areaPath);
    addIf(src.assigneeId, "/fields/System.AssignedTo", src.assigneeId);
    addIf(src.tags.length, "/fields/System.Tags", src.tags.join("; "));
    addIf(src.storyPoints, "/fields/Microsoft.VSTS.Scheduling.StoryPoints", src.storyPoints);
    addIf(src.estimateHours, "/fields/Microsoft.VSTS.Scheduling.OriginalEstimate", src.estimateHours);
    addIf(src.priority != null, "/fields/Microsoft.VSTS.Common.Priority", src.priority);
    // Même parent que la source (hiérarchie Feature → US → Tâche préservée).
    addIf(src.parentId, "/relations/-", {
      rel: "System.LinkTypes.Hierarchy-Reverse",
      url: `https://dev.azure.com/${session.adoOrg}/_apis/wit/workItems/${src.parentId}`,
    });

    const raw = await this.ado.createWorkItem(session.adoOrg, session.adoProjectId, src.workItemType, patches, token);
    const ticket = this.mapper.toTicket(raw);
    // Champs dérivés absents de la réponse de création.
    ticket.parentId = src.parentId;
    ticket.epicId = src.epicId;
    ticket.epicTitle = src.epicTitle;
    await this.redis.updateTicket(sessionId, ticket);
    return ticket;
  }

  /** Champs ADO proposables pour un type de work item (personnalisation du panneau ticket). */
  async getTypeFields(sessionId: string, type: string, token: string) {
    const session = await this.prisma.planningSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new Error(`Session ${sessionId} not found`);
    return this.ado.getTypeFields(session.adoOrg, session.adoProjectId, type, token);
  }

  async applyOperation(sessionId: string, op: Operation): Promise<Ticket> {
    const ticket = await this.redis.getTicket(sessionId, op.ticketId);
    if (!ticket) throw new Error(`Ticket ${op.ticketId} not found`);

    const oldValue = getTicketField(ticket, op.field);
    setTicketField(ticket, op.field, op.value);
    ticket.syncStatus = "pending";

    await this.redis.updateTicket(sessionId, ticket);

    const log = await this.prisma.operationsLog.create({
      data: {
        sessionId,
        ticketId: op.ticketId,
        field: op.field,
        oldValue: oldValue != null ? String(oldValue) : null,
        newValue: op.value != null ? String(op.value) : null,
        performedBy: op.userId,
      },
    });

    // ponytail: kill-switch writeback pour env de test — WRITEBACK_ENABLED=false
    // applique l'op dans Redis + la logge, mais n'écrit jamais vers ADO.
    if (process.env.WRITEBACK_ENABLED !== "false") {
      await this.writebackService.enqueue(sessionId, op, log.id);
    }

    return ticket;
  }

  /**
   * Définit la capacité d'un membre pour une itération, persistée par projet ADO
   * (partagée entre toutes les sessions du projet). 0 = absent ; négatif = suppression.
   */
  async setCapacity(sessionId: string, cap: Capacity): Promise<Capacity[]> {
    const session = await this.prisma.planningSession.findUniqueOrThrow({ where: { id: sessionId } });
    await this.capacities.set(session.adoProjectId, cap);
    const teamMembers = await this.redis.getTeamMembers(sessionId);
    return this.capacities.list(session.adoProjectId, teamMembers);
  }

  /** Définit le poste/rôle d'un membre, persisté par projet ADO (partagé entre sessions). */
  async setMemberMeta(sessionId: string, meta: MemberMeta): Promise<MemberMeta[]> {
    const session = await this.prisma.planningSession.findUniqueOrThrow({ where: { id: sessionId } });
    await this.memberMeta.set(session.adoProjectId, meta);
    const teamMembers = await this.redis.getTeamMembers(sessionId);
    return this.memberMeta.list(session.adoProjectId, teamMembers);
  }

  async getAuditLog(sessionId: string) {
    return this.prisma.operationsLog.findMany({
      where: { sessionId },
      orderBy: { performedAt: "desc" },
    });
  }
}
