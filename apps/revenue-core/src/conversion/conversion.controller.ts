import { Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { requestWorkspace } from "../common/http";
import { ConversionService } from "./conversion.service";
import { ConversionQueueService } from "./conversion-queue.service";

@Controller("api/v1/conversion-deliveries")
export class ConversionController {
  constructor(private readonly service: ConversionService, private readonly queue: ConversionQueueService) {}

  @Get()
  list(@Req() request: Request) {
    return this.service.list(requestWorkspace(request));
  }

  @Post("process")
  process() {
    return this.service.processBatch();
  }

  @Post(":id/replay")
  async replay(@Param("id") id: string, @Req() request: Request) {
    const delivery = await this.service.replay(requestWorkspace(request), id);
    await this.queue.kick("operator-replay").catch(() => undefined);
    return delivery;
  }
}
