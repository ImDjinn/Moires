import { Injectable } from "@nestjs/common";
import type { CreateSessionDto, SessionSnapshot, Operation, Ticket, Iteration } from "@moires/shared";
import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../database/redis.service";
import { AdoService } from "../ado/ado.service";
import { SyncService } from "../sync/sync.service";
import { WritebackService } from "../writeback/writeback.service";

@Injectable()
export class SessionsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private ado: AdoService,
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

    const { tickets, teamMembers } = await this.syncService.syncInitial(
      session.id,
      org,
      dto.adoProjectId,
      iterationIds,
      token,
      dto.areaPaths,
    );

    await this.redis.setIterations(session.id, iterations);
    await this.redis.setTeamMembers(session.id, teamMembers);
    await this.redis.addParticipant(session.id, userId);

    return {
      sessionId: session.id,
      tickets,
      participants: [],
      teamMembers,
      iterations,
    };
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
    const [tickets, presences, iterations, teamMembers] = await Promise.all([
      this.redis.getTickets(sessionId),
      this.redis.getPresences(sessionId),
      this.redis.getIterations(sessionId),
      this.redis.getTeamMembers(sessionId),
    ]);
    return { sessionId, tickets, participants: presences, teamMembers, iterations };
  }

  async applyOperation(sessionId: string, op: Operation): Promise<Ticket> {
    const ticket = await this.redis.getTicket(sessionId, op.ticketId);
    if (!ticket) throw new Error(`Ticket ${op.ticketId} not found`);

    const oldValue = ticket[op.field as keyof Ticket];
    (ticket as any)[op.field] = op.value;
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

    await this.writebackService.enqueue(sessionId, op, log.id);

    return ticket;
  }

  async getAuditLog(sessionId: string) {
    return this.prisma.operationsLog.findMany({
      where: { sessionId },
      orderBy: { performedAt: "desc" },
    });
  }
}
