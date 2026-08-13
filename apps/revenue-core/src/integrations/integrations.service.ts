import { Injectable } from "@nestjs/common";
import { erpAdapter, modelAdapter } from "./adapters";

@Injectable()
export class IntegrationsService {
  aiHealth() { return modelAdapter().healthCheck(); }
  aiSuggestion(input: Record<string, unknown>) { return modelAdapter().generateStructuredSuggestion(input); }
  erpHealth() { return erpAdapter().testConnection(); }
  erpCustomer(input: Record<string, unknown>) { return erpAdapter().upsertCustomer(input); }
  erpOrder(input: Record<string, unknown>) { return erpAdapter().upsertOrder(input); }
  erpOrderStatus(externalOrderId: string) { return erpAdapter().getOrderStatus(externalOrderId); }
}
