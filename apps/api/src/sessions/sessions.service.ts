import { Injectable } from "@nestjs/common";
import type { CreateSessionDto, SessionSnapshot, Operation, Ticket } from "@moires/shared";
import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../database/redis.service";
import { SyncService } from "../sync/sync.service";
import { WritebackService } from "../writeback/writeback.service";

@Injectable()
export class SessionsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private syncService: SyncService,
    private writebackService: WritebackService,
  ) {}

  async createSession(
    dto: CreateSessionDto,
    userId: string,
    token: string,
  ): Promise<SessionSnapshot> {
    const session = await this.prisma.planningSession.create({
      data: {
        adoProjectId: dto.adoProjectId,
        adoIterationIds: dto.adoIterationIds,
        areaPaths: dto.areaPaths || [],
        createdBy: userId,
      },
    });

    const { tickets, teamMembers } = await this.syncService.syncInitial(
      session.id,
      dto.adoProjectId,
      dto.adoIterationIds,
      token,
      dto.areaPaths,
    );

    await this.redis.addParticipant(session.id, userId);

    return {
      sessionId: session.id,
      tickets,
      participants: [],
      teamMembers,
    };
  }

  async getSnapshot(sessionId: string): Promise<SessionSnapshot> {
    const tickets = await this.redis.getTickets(sessionId);
    const presences = await this.redis.getPresences(sessionId);
    return {
      sessionId,
      tickets,
      participants: presences,
      teamMembers: [],
    };
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
