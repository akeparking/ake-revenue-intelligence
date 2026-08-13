import { Controller, Get } from "@nestjs/common";
import { loadConfig } from "./config";

@Controller()
export class HealthController {
  @Get("health")
  health() {
    const config = loadConfig();
    return { status: "ok", service: "ake-revenue-core", store: config.storeDriver, adsMode: config.adsMode, aiAutoSend: false };
  }

  @Get("metrics")
  metrics() {
    return "ake_revenue_core_up 1\n";
  }
}
