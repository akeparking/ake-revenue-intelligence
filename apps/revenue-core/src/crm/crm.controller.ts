import { Body, Controller, Get, Inject, Post, Req } from "@nestjs/common";
import { createNoteSchema, createOpportunitySchema, createTaskSchema } from "@ake/contracts";
import type { Request } from "express";
import { requestUser, requestWorkspace } from "../common/http";
import { ConversionQueueService } from "../conversion/conversion-queue.service";
import { REVENUE_STORE, type RevenueStore } from "../store/store.types";

@Controller("api/v1")
export class CrmController {
  constructor(
    @Inject(REVENUE_STORE) private readonly store: RevenueStore,
    private readonly queue: ConversionQueueService,
  ) {}

  @Get("opportunities")
  listOpportunities(@Req() request: Request) {
    return this.store.listOpportunities(requestWorkspace(request));
  }

  @Get("persons")
  listPersons(@Req() request: Request) { return this.store.listPersons(requestWorkspace(request)); }

  @Get("companies")
  listCompanies(@Req() request: Request) { return this.store.listCompanies(requestWorkspace(request)); }

  @Get("orders")
  listOrders(@Req() request: Request) { return this.store.listOrders(requestWorkspace(request)); }

  @Get("tasks")
  listTasks(@Req() request: Request) { return this.store.listTasks(requestWorkspace(request)); }

  @Post("tasks")
  createTask(@Body() body: unknown, @Req() request: Request) {
    return this.store.createTask(createTaskSchema.parse({ ...(body as object), workspaceId: requestWorkspace(request), ownerId: (body as any)?.ownerId || requestUser(request) }));
  }

  @Get("notes")
  listNotes(@Req() request: Request) { return this.store.listNotes(requestWorkspace(request)); }

  @Post("notes")
  createNote(@Body() body: unknown, @Req() request: Request) {
    return this.store.createNote(createNoteSchema.parse({ ...(body as object), workspaceId: requestWorkspace(request), authorId: requestUser(request) }));
  }

  @Get("audit")
  listAudit(@Req() request: Request) { return this.store.listAudit(requestWorkspace(request)); }

  @Post("opportunities")
  async createOpportunity(@Body() body: unknown, @Req() request: Request) {
    const input = createOpportunitySchema.parse({
      ...(body as object),
      workspaceId: requestWorkspace(request),
      ownerId: (body as any)?.ownerId || requestUser(request),
    });
    const result = await this.store.createOpportunity(input);
    await this.queue.kick("opportunity-qualified").catch(() => undefined);
    return result;
  }

  @Get("dashboard")
  dashboard(@Req() request: Request) {
    return this.store.getDashboard(requestWorkspace(request));
  }
}
