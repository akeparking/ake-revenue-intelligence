import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { loadConfig } from "../config";

export const CONVERSION_QUEUE = "qualified-feedback";

@Injectable()
export class ConversionQueueService implements OnModuleDestroy {
  private readonly connection?: IORedis;
  private readonly queue?: Queue;

  constructor() {
    const redisUrl = loadConfig().redisUrl;
    if (!redisUrl) return;
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true });
    this.queue = new Queue(CONVERSION_QUEUE, { connection: this.connection });
  }

  async kick(reason = "domain-event") {
    if (!this.queue) return { queued: false, reason: "redis_not_configured" };
    await this.queue.add("scan-outbox", { reason }, { removeOnComplete: 100, removeOnFail: 200 });
    return { queued: true };
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.connection?.quit();
  }
}
