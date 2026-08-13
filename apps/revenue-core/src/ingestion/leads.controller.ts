import { Body, Controller, Get, Inject, Post, Req } from "@nestjs/common";
import { ingestLeadSchema } from "@ake/contracts";
import type { Request } from "express";
import { requestWorkspace } from "../common/http";
import { REVENUE_STORE, type RevenueStore } from "../store/store.types";
import { IngestionService } from "./ingestion.service";

@Controller("api/v1/leads")
export class LeadsController {
  constructor(
    private readonly ingestion: IngestionService,
    @Inject(REVENUE_STORE) private readonly store: RevenueStore,
  ) {}

  @Get()
  list(@Req() request: Request) {
    return this.store.listLeads(requestWorkspace(request));
  }

  @Post()
  create(@Body() body: unknown, @Req() request: Request) {
    const workspaceId = requestWorkspace(request);
    const parsed = ingestLeadSchema.parse({ ...(body as object), workspaceId });
    return this.ingestion.ingest(parsed, body, "manual_api");
  }
}
