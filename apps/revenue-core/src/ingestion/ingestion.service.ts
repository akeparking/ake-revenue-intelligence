import { Inject, Injectable } from "@nestjs/common";
import { ingestLeadSchema, type IngestLeadInput, type LeadRecord } from "@ake/contracts";
import { sha256 } from "../common/crypto";
import { REVENUE_STORE, type RevenueStore } from "../store/store.types";

@Injectable()
export class IngestionService {
  constructor(@Inject(REVENUE_STORE) private readonly store: RevenueStore) {}

  async ingest(input: IngestLeadInput, rawPayload: unknown, eventType: string): Promise<LeadRecord> {
    const parsed = ingestLeadSchema.parse(input);
    await this.store.saveRawEvent({
      workspaceId: parsed.workspaceId,
      provider: parsed.provider,
      eventType,
      externalEventId: parsed.externalLeadId,
      payload: rawPayload,
      payloadHash: sha256(JSON.stringify(rawPayload)),
      receivedAt: new Date().toISOString(),
    });
    return this.store.ingestLead(parsed);
  }
}
