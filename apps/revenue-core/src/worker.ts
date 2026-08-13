import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { AppModule } from "./app.module";
import { CONVERSION_QUEUE } from "./conversion/conversion-queue.service";
import { ConversionService } from "./conversion/conversion.service";
import { loadConfig } from "./config";

const logger = new Logger("RevenueWorker");

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn", "log"] });
  const conversions = app.get(ConversionService);
  let stopping = false;
  const redisUrl = loadConfig().redisUrl;
  let connection: IORedis | undefined;
  let queue: Queue | undefined;
  let worker: Worker | undefined;

  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await worker?.close();
    await queue?.close();
    await connection?.quit();
    await app.close();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  if (redisUrl) {
    connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    queue = new Queue(CONVERSION_QUEUE, { connection });
    worker = new Worker(CONVERSION_QUEUE, () => conversions.processBatch(25), { connection, concurrency: 2 });
    worker.on("failed", (job, error) => logger.error(`Queue job ${job?.id || "unknown"} failed: ${error.message}`));
    await queue.upsertJobScheduler("conversion-outbox-scan", { every: 5_000 }, { name: "scheduled-scan", data: {}, opts: { removeOnComplete: 100, removeOnFail: 200 } });
    logger.log("BullMQ outbox worker started");
    return;
  }

  logger.warn("REDIS_URL not set; using local polling fallback");
  while (!stopping) {
    try {
      const processed = await conversions.processBatch(25);
      if (processed.length) logger.log(`Processed ${processed.length} conversion delivery item(s)`);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}

bootstrap().catch((error) => {
  logger.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
