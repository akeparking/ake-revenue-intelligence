import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { IntegrationsService } from "./integrations.service";

@Controller("api/v1")
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get("ai/health")
  aiHealth() {
    return this.integrations.aiHealth();
  }

  @Post("ai/suggestions")
  aiSuggestion(@Body() body: Record<string, unknown>) {
    return this.integrations.aiSuggestion(body);
  }

  @Get("erp/health")
  erpHealth() {
    return this.integrations.erpHealth();
  }

  @Post("erp/customers/upsert")
  erpCustomer(@Body() body: Record<string, unknown>) {
    return this.integrations.erpCustomer(body);
  }

  @Post("erp/orders/upsert")
  erpOrder(@Body() body: Record<string, unknown>) {
    return this.integrations.erpOrder(body);
  }

  @Get("erp/orders/:externalOrderId")
  erpOrderStatus(@Param("externalOrderId") externalOrderId: string) {
    return this.integrations.erpOrderStatus(externalOrderId);
  }
}
