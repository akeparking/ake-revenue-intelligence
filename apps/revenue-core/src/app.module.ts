import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ApiKeyGuard } from "./common/api-key.guard";
import { ConversionController } from "./conversion/conversion.controller";
import { ConversionQueueService } from "./conversion/conversion-queue.service";
import { ConversionService } from "./conversion/conversion.service";
import { CrmController } from "./crm/crm.controller";
import { DemoSeeder } from "./database/demo-seeder.service";
import { HealthController } from "./health.controller";
import { IngestionService } from "./ingestion/ingestion.service";
import { LeadsController } from "./ingestion/leads.controller";
import { WebhooksController } from "./ingestion/webhooks.controller";
import { IntegrationsController } from "./integrations/integrations.controller";
import { IntegrationsService } from "./integrations/integrations.service";
import { OkkiController } from "./integrations/okki.controller";
import { OkkiService } from "./integrations/okki.service";
import { OpenApiController } from "./openapi.controller";
import { RequirementsController } from "./requirements/requirements.controller";
import { RequirementsService } from "./requirements/requirements.service";
import { revenueStoreProvider } from "./store/store.provider";

@Module({
  controllers: [
    HealthController,
    LeadsController,
    WebhooksController,
    CrmController,
    ConversionController,
    IntegrationsController,
    OkkiController,
    OpenApiController,
    RequirementsController,
  ],
  providers: [
    revenueStoreProvider,
    IngestionService,
    ConversionService,
    ConversionQueueService,
    IntegrationsService,
    OkkiService,
    DemoSeeder,
    RequirementsService,
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
  exports: [ConversionService, IngestionService, revenueStoreProvider],
})
export class AppModule {}
