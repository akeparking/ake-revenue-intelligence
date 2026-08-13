import { describe, expect, it } from "vitest";
import { MemoryRevenueStore } from "./memory.store";

function leadInput(externalLeadId = "leadgen-1") {
  return {
    workspaceId: "ake-demo",
    provider: "meta" as const,
    sourceKind: "instant_form" as const,
    externalLeadId,
    displayName: "Test Buyer",
    email: "BUYER@example.com",
    country: "AE",
    isTest: true,
    attribution: {
      provider: "meta" as const,
      sourceKind: "instant_form" as const,
      occurredAt: "2026-08-12T00:00:00.000Z",
      identifiers: [{ type: "meta_leadgen_id" as const, value: externalLeadId }],
    },
  };
}

describe("qualified outbox invariants", () => {
  it("deduplicates inbound leads by platform lead id", async () => {
    const store = new MemoryRevenueStore();
    const first = await store.ingestLead(leadInput());
    const second = await store.ingestLead(leadInput());
    expect(second.id).toBe(first.id);
    expect(await store.listLeads("ake-demo")).toHaveLength(1);
  });

  it("creates the opportunity and one Qualified delivery atomically", async () => {
    const store = new MemoryRevenueStore();
    const lead = await store.ingestLead(leadInput());
    const input = {
      workspaceId: "ake-demo",
      personId: lead.personId,
      primarySourceLeadId: lead.id,
      name: "Airport parking project",
      direction: "Automated parking",
      country: "AE",
      ownerId: "seller-1",
      nextAction: "Book discovery call",
      currency: "USD",
    };
    const first = await store.createOpportunity(input);
    const second = await store.createOpportunity(input);
    expect(first.delivery.eventId).toBe(`qualified:ake-demo:${lead.id}:v1`);
    expect(first.delivery.status).toBe("pending");
    expect(second.deduplicated).toBe(true);
    expect(await store.listDeliveries("ake-demo")).toHaveLength(1);
  });

  it("creates a skipped ledger entry when advertising attribution is absent", async () => {
    const store = new MemoryRevenueStore();
    const lead = await store.ingestLead({
      ...leadInput("organic-1"),
      provider: "organic",
      sourceKind: "chat",
      attribution: { provider: "organic", sourceKind: "chat", occurredAt: "2026-08-12T00:00:00.000Z", identifiers: [] },
    });
    const result = await store.createOpportunity({
      workspaceId: "ake-demo",
      personId: lead.personId,
      primarySourceLeadId: lead.id,
      name: "Organic inquiry",
      direction: "Parking solution",
      country: "IT",
      ownerId: "seller-1",
      nextAction: "Qualify scope",
      currency: "USD",
    });
    expect(result.delivery.status).toBe("skipped");
    expect(result.delivery.skippedReason).toBe("no_attribution");
  });

  it("does not treat campaign or ad hierarchy IDs as a matchable customer identifier", async () => {
    const store = new MemoryRevenueStore();
    const lead = await store.ingestLead({
      ...leadInput("okki-meta-history"),
      sourceKind: "manual",
      attribution: { provider: "meta", sourceKind: "manual", occurredAt: "2026-08-12T00:00:00.000Z", identifiers: [{ type: "ad_id", value: "ad-only-1" }] },
    });
    const result = await store.createOpportunity({
      workspaceId: "ake-demo",
      personId: lead.personId,
      primarySourceLeadId: lead.id,
      name: "Historical Meta inquiry",
      direction: "Parking solution",
      country: "AE",
      ownerId: "seller-1",
      nextAction: "Verify original ad identity",
      currency: "USD",
    });
    expect(result.delivery.status).toBe("skipped");
  });
});
