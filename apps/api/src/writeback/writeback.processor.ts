import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Worker, Job } from "bullmq";
import type { Operation } from "@moires/shared";
import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../database/redis.service";
import { AdoService } from "../ado/ado.service";
import { BroadcastService } from "../realtime/broadcast.service";

interface WritebackJob {
  sessionId: string;
  op: Operation;
  logId: string;
}

@Injectable()
export class WritebackProcessor implements OnModuleInit {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private redis: RedisService,
    private ado: AdoService,
    private broadcast: BroadcastService,
  ) {}

  onModuleInit() {
    const redisUrl = new URL(this.config.get<string>("REDIS_URL")!);
    new Worker("ado-writeback", (job) => this.process(job), {
      connection: {
        host: redisUrl.hostname,
        port: Number(redisUrl.port) || 6379,
      },
    });
  }

  private async process(job: Job<WritebackJob>) {
    const { sessionId, op, logId } = job.data;

    try {
      const ticket = await this.redis.getTicket(sessionId, op.ticketId);
      if (!ticket) throw new Error(`Ticket ${op.ticketId} not found in Redis`);

      const session = await this.prisma.planningSession.findUnique({
        where: { id: sessionId },
      });
      if (!session) throw new Error(`Session ${sessionId} not found`);

      const token =
        (await this.redis.getUserToken(sessionId, op.userId)) ??
        this.config.get<string>("ADO_SYSTEM_TOKEN") ??
        "";

      const newRev = await this.ado.patchWorkItem(
        session.adoOrg,
        op.ticketId,
        op.field,
        op.value,
        ticket.adoRev,
        token,
      );

      (ticket as any)[op.field] = op.value;
      ticket.adoRev = newRev;
      ticket.syncStatus = "synced";
      await this.redis.updateTicket(sessionId, ticket);

      await this.prisma.operationsLog.update({
        where: { id: logId },
        data: { adoSyncStatus: "synced" },
      });

      this.broadcast.send(sessionId, "ticket:sync-status", {
        ticketId: ticket.id,
        syncStatus: "synced",
        adoRev: ticket.adoRev,
      });
    } catch (error) {
      console.error(
        `[writeback] échec tentative ${job.attemptsMade + 1}/${job.opts.attempts || 5} —`,
        `session=${sessionId} ticket=${op.ticketId} field=${op.field}:`,
        error instanceof Error ? error.message : error,
      );
      if (job.attemptsMade >= (job.opts.attempts || 5) - 1) {
        await this.prisma.operationsLog.update({
          where: { id: logId },
          data: { adoSyncStatus: "failed" },
        });

        const ticket = await this.redis.getTicket(sessionId, op.ticketId);
        if (ticket) {
          ticket.syncStatus = "error";
          await this.redis.updateTicket(sessionId, ticket);
          // ponytail: ticket:updated (pas ticket:sync-status) pour que le frontend
          // revienne à la valeur réelle d'ADO — à ce stade setTickets a déjà
          // écrasé Redis avec les données fraîches lors du poll de 5s.
          this.broadcast.send(sessionId, "ticket:updated", ticket);
        }
      }
      throw error;
    }
  }
}
