import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../database/redis.service";

// Le webhook n'appelle plus ADO : il invalide le créneau de sync des sessions
// qui contiennent le work item, et le prochain poll (5s côté client) re-fetche
// avec le PAT du polleur. Aucun credential emprunté à un utilisateur pour des
// requêtes qu'il n'a pas initiées ; latence de propagation ≤ ~5s au lieu
// d'instantané — assumé.
@Injectable()
export class AdoWebhookService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async handleWorkItemUpdated(workItemId: string): Promise<void> {
    const cacheEntries = await this.prisma.ticketsCache.findMany({
      where: { id: workItemId },
      select: { sessionId: true },
    });

    for (const sessionId of new Set(cacheEntries.map((e) => e.sessionId))) {
      await this.redis.clearSyncSlot(sessionId);
    }
  }
}
