import { Inject, Injectable } from "@nestjs/common";
import { redactPayload } from "../common/http";
import { REVENUE_STORE, type RevenueStore } from "../store/store.types";
import { AdapterError, adapterFor } from "./adapters";

@Injectable()
export class ConversionService {
  constructor(@Inject(REVENUE_STORE) private readonly store: RevenueStore) {}

  list(workspaceId: string) {
    return this.store.listDeliveries(workspaceId);
  }

  replay(workspaceId: string, deliveryId: string) {
    return this.store.replayDelivery(workspaceId, deliveryId);
  }

  async processBatch(limit = 25) {
    const deliveries = await this.store.claimPendingDeliveries(limit);
    const results = [];
    for (const delivery of deliveries) {
      const context = await this.store.getQualifiedContext(delivery.id);
      if (!context) {
        results.push(await this.store.updateDelivery(delivery.id, { status: "dead_letter", providerErrorCode: "CONTEXT_MISSING", providerErrorMessage: "Qualified context is missing" }));
        continue;
      }
      const adapter = adapterFor(delivery.provider, delivery.mode);
      let payload: Record<string, unknown> = {};
      try {
        if (delivery.mode === "live" && (context.lead.isTest || context.lead.rawAttribution.consentStatus !== "granted")) throw new AdapterError("Live delivery requires a non-test lead and granted consent", "LIVE_GUARD", false);
        payload = adapter.buildQualifiedPayload(context);
        const sent = await adapter.send(payload);
        results.push(
          await this.store.updateDelivery(delivery.id, {
            status: "accepted",
            diagnosticStatus: sent.diagnosticStatus,
            attemptCount: delivery.attemptCount + 1,
            providerResponseId: sent.responseId,
            payloadPreview: redactPayload(payload) as Record<string, unknown>,
          }),
        );
      } catch (error) {
        const adapterError = error instanceof AdapterError ? error : new AdapterError(error instanceof Error ? error.message : "Unknown adapter error", "UNEXPECTED", true);
        const attempts = delivery.attemptCount + 1;
        const dead = !adapterError.retryable || attempts >= 5;
        const delayMinutes = [1, 5, 15, 60, 240][Math.min(attempts - 1, 4)];
        results.push(
          await this.store.updateDelivery(delivery.id, {
            status: dead ? "dead_letter" : "retrying",
            attemptCount: attempts,
            nextRetryAt: dead ? undefined : new Date(Date.now() + delayMinutes * 60_000).toISOString(),
            providerErrorCode: adapterError.code,
            providerErrorMessage: adapterError.message,
            payloadPreview: redactPayload(payload) as Record<string, unknown>,
          }),
        );
      }
    }
    return results;
  }
}
