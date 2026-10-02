import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import type { CreateInquiryInput, QualificationAnalysis } from "@ake/contracts";
import { REVENUE_STORE, type RevenueStore } from "../store/store.types";
import { analyzeInquiry, validateAnalysis } from "./qualification";

@Injectable()
export class InboxService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(@Inject(REVENUE_STORE) private readonly store: RevenueStore) {}

  async receive(workspaceId: string, input: CreateInquiryInput, imported?: { analysis?: QualificationAnalysis; provider: string; error?: string }) {
    if (imported?.analysis) validateAnalysis(imported.analysis, input.message);
    const lead = await this.store.ingestLead({
      workspaceId, provider: "organic", sourceKind: "chat",
      externalLeadId: `inbox:${input.channel}:${input.conversationId}`,
      displayName: input.displayName, email: input.email, isTest: input.isTest,
      attribution: { provider: "organic", sourceKind: "chat", occurredAt: input.occurredAt, identifiers: [], consentStatus: "unknown", metadata: { channel: input.channel } },
    });
    const inquiry = await this.store.saveInquiry({ ...input, workspaceId, leadId: lead.id, deferAnalysis: !!imported });
    if (imported) return this.store.completeInquiry(workspaceId, inquiry.id, imported);
    return inquiry;
  }

  async processNext() {
    if (this.running) return;
    this.running = true;
    try {
      const item = await this.store.claimInquiry();
      if (!item) return;
      try {
        const result = await analyzeInquiry(item.message);
        return await this.store.completeInquiry(item.workspaceId, item.id, result);
      } catch {
        return await this.store.completeInquiry(item.workspaceId, item.id, { provider: "unavailable", error: "Analysis failed. Original inquiry is preserved for manual review." });
      }
    } finally { this.running = false; }
  }

  onApplicationBootstrap() {
    this.timer = setInterval(() => { void this.processNext().catch(() => undefined); }, 1500);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}
