import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { requestWorkspace } from "../common/http";
import { OkkiService } from "./okki.service";

@Controller("api/v1/connectors/okki")
export class OkkiController {
  constructor(private readonly okki: OkkiService) {}

  @Get("status")
  status() { return this.okki.status(); }

  @Post("sync")
  sync(@Body() body: { limit?: number; includeConverted?: boolean }, @Req() request: Request) {
    return this.okki.sync(requestWorkspace(request), body?.limit, body?.includeConverted !== false);
  }
}
