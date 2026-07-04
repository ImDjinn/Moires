import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import type { Operation } from "@moirai/shared";

@Injectable()
export class WritebackService {
  private queue: Queue;

  constructor(config: ConfigService) {
    const redisUrl = new URL(config.get<string>("REDIS_URL")!);
    this.queue = new Queue("ado-writeback", {
      connection: {
        host: redisUrl.hostname,
        port: Number(redisUrl.port) || 6379,
        password: redisUrl.password || undefined,
      },
    });
  }

  async enqueue(sessionId: string, op: Operation, logId: string) {
    await this.queue.add("patch", { sessionId, op, logId }, {
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
    });
  }
}
