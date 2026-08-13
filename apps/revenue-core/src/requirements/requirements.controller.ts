import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { analyzeRequirementSchema } from "@ake/contracts";
import type { Request } from "express";
import { requestUser, requestWorkspace } from "../common/http";
import { RequirementsService } from "./requirements.service";

@Controller("api/v1/requirements")
export class RequirementsController {
  constructor(private readonly requirements: RequirementsService) {}

  @Get("health")
  health() {
    return this.requirements.health();
  }

  @Post("analyze")
  analyze(@Body() body: unknown, @Req() request: Request) {
    const input = analyzeRequirementSchema.parse(body);
    return this.requirements.analyze(input, requestWorkspace(request), requestUser(request));
  }

  @Get(":leadId")
  profile(@Param("leadId") leadId: string, @Query("conversationId") conversationId: string | undefined, @Req() request: Request) {
    return this.requirements.profile(requestWorkspace(request), leadId, conversationId);
  }
}
