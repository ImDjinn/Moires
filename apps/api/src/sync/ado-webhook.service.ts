import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../database/redis.service";
import { AdoService } from "../ado/ado.service";
import { AdoMapper } from "../ado/ado.mapper";
import { BroadcastService } from "../realtime/broadcast.service";

@Injectable()
export class AdoWebhookService {
  private readonly logger = new Logger(AdoWebhookService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private ado: AdoService,
    private mapper: AdoMapper,
    private broadcast: BroadcastService,
  ) {}

  // Le webhook n'a pas de contexte utilisateur : on emprunte le PAT (par
  // utilisateur, jamais partagé) du premier participant courant qui en a un —
  // lecture seule du work item, pas d'écriture avec ce token.
  private async anyParticipantToken(sessionId: string): Promise<string | null> {
    for (const userId of await this.redis.getParticipants(sessionId)) {
      const token = await this.redis.getUserToken(sessionId, userId);
      if (token) return token;
    }
    return null;
  }

  async handleWorkItemUpdated(workItemId: string, adoOrg: string): Promise<void> {
    const cacheEntries = await this.prisma.ticketsCache.findMany({
      where: { id: workItemId },
      select: { sessionId: true },
    });

    if (!cacheEntries.length) return;

    const uniqueSessions = [...new Set(cacheEntries.map((e) => e.sessionId))];

    for (const sessionId of uniqueSessions) {
      try {
        const token = await this.anyParticipantToken(sessionId);
        if (!token) {
          this.logger.warn(`No token available for session ${sessionId}, skipping ADO fetch`);
          continue;
        }

        const [raw] = await this.ado.getWorkItemsBatch(adoOrg, [workItemId], token);
        if (!raw) continue;

        const ticket = this.mapper.toTicket(raw);
        // Le mapper laisse epicId à null : on le recalcule (gère aussi le re-parentage).
        const epic = (await this.ado.resolveEpics(adoOrg, [raw], token)).get(ticket.id);
        if (epic) {
          ticket.epicId = epic.id;
          ticket.epicTitle = epic.title;
        }
        ticket.syncStatus = "synced";

        await this.redis.updateTicket(sessionId, ticket);

        await this.prisma.ticketsCache.update({
          where: { id: workItemId },
          data: {
            title: ticket.title,
            assigneeId: ticket.assigneeId,
            areaPath: ticket.areaPath,
            iterationId: ticket.iterationId,
            startDate: new Date(ticket.startDate),
            endDate: new Date(ticket.endDate),
            estimateHours: ticket.estimateHours,
            adoRev: ticket.adoRev,
            syncStatus: "synced",
          },
        });

        this.broadcast.send(sessionId, "ticket:updated", ticket);
      } catch (err) {
        this.logger.error(`Failed to sync work item ${workItemId} for session ${sessionId}`, err);
      }
    }
  }
}
