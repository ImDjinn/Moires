import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Worker, Job } from "bullmq";
import type { Operation } from "@moires/shared";
import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../database/redis.service";
import { AdoService } from "../ado/ado.service";

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

      // token retrieval: in production this would come from a secure store
      // For now we use system token from env
      const token = this.config.get<string>("ADO_SYSTEM_TOKEN") || "";

      const newRev = await this.ado.patchWorkItem(
        op.ticketId,
        op.field,
        op.value,
        ticket.adoRev,
        token,
      );

      ticket.adoRev = newRev;
      ticket.syncStatus = "synced";
      await this.redis.updateTicket(sessionId, ticket);

      await this.prisma.operationsLog.update({
        where: { id: logId },
        data: { adoSyncStatus: "synced" },
      });
    } catch (error) {
      if (job.attemptsMade >= (job.opts.attempts || 5) - 1) {
        await this.prisma.operationsLog.update({
          where: { id: logId },
          data: { adoSyncStatus: "failed" },
        });

        const ticket = await this.redis.getTicket(sessionId, op.ticketId);
        if (ticket) {
          ticket.syncStatus = "error";
          await this.redis.updateTicket(sessionId, ticket);
        }
      }
      throw error;
    }
  }
}
