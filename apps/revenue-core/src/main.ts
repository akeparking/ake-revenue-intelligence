import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { loadConfig } from "./config";

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(",").map((value) => value.trim()) || true,
    credentials: true,
  });
  app.enableShutdownHooks();

  await app.listen(config.port, "0.0.0.0");
  Logger.log(`Revenue Core listening on :${config.port}`, "Bootstrap");
}

bootstrap().catch((error) => {
  Logger.error(error instanceof Error ? error.stack : String(error), "Bootstrap");
  process.exitCode = 1;
});
