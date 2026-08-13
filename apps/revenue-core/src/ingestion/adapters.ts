import type { IngestLeadInput } from "@ake/contracts";

export interface WebhookEnvelope {
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
  body: unknown;
}

export interface LeadSourceAdapter {
  verifyWebhook(envelope: WebhookEnvelope): Promise<void> | void;
  normalizeLead(envelope: WebhookEnvelope): Promise<IngestLeadInput[]> | IngestLeadInput[];
  fetchLeadDetails(externalLeadId: string): Promise<Record<string, unknown> | undefined>;
  reconcile(since: string): Promise<{ scanned: number; inserted: number }>;
  createTestLead(): Promise<{ externalLeadId: string }>;
}

// Provider-specific implementations are intentionally kept behind this contract.
// The webhook controller currently composes the Meta, Google and Chatwoot MVP paths;
// later connectors can be extracted without changing RevenueStore or the domain model.
