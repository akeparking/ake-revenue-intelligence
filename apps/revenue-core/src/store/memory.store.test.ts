import { afterEach, describe, expect, it, vi } from "vitest";
import type { RevenueStore } from "./store.types";
import { MemoryRevenueStore } from "./memory.store";
import { PostgresRevenueStore } from "./postgres.store";
import { randomUUID } from "node:crypto";
import { mockQualification } from "../inbox/qualification";

const drivers = ["memory", ...(process.env.TEST_DATABASE_URL ? ["postgres"] : [])];
describe.each(drivers)("%s workflow invariants", (driver) => {
  let store: RevenueStore;
  afterEach(async () => { await store?.close(); vi.unstubAllEnvs(); });
  async function setup() {
    store = driver === "postgres" ? new PostgresRevenueStore(process.env.TEST_DATABASE_URL!) : new MemoryRevenueStore();
    const workspaceId = `test-${randomUUID()}`;
    const input = { workspaceId, provider: "organic" as const, sourceKind: "chat" as const, externalLeadId: "chat:1", displayName: "Fictional buyer", isTest: true, attribution: { provider: "organic" as const, sourceKind: "chat" as const, occurredAt: new Date().toISOString(), identifiers: [] } };
    const lead = await store.ingestLead(input);
    const opportunity = { workspaceId, personId: lead.personId, primarySourceLeadId: lead.id, name: "Demo mall", direction: "ANPR", country: "SA", ownerId: "reviewer", nextAction: "Request drawings", currency: "USD" };
    return { workspaceId, lead, input, opportunity };
  }
  it("deduplicates concurrent intake and opportunity commands without implicit qualification", async () => {
    const { workspaceId, input, opportunity } = await setup();
    await Promise.all(Array.from({ length: 4 }, () => store.ingestLead(input)));
    const results = await Promise.all(Array.from({ length: 4 }, () => store.createOpportunity(opportunity)));
    expect(new Set(results.map((r) => r.opportunity.id)).size).toBe(1);
    expect(await store.listLeads(workspaceId)).toHaveLength(1);
    expect(await store.listDeliveries(workspaceId)).toHaveLength(0);
    expect((await store.listLeads(workspaceId))[0].status).toBe("new");
  });
  it("requires human qualification and emits one Mock event without inventing ad IDs", async () => {
    const { workspaceId, opportunity } = await setup();
    const created = await store.createOpportunity(opportunity);
    const input = { workspaceId, opportunityId: created.opportunity.id, actorId: "human-reviewer", contactReachable: true as const, relevantNeed: true as const, targetBuyer: true as const, nextAction: "Request site drawings" };
    await expect(store.qualifyOpportunity({ ...input, contactReachable: false as any })).rejects.toThrow();
    const results = await Promise.all(Array.from({ length: 4 }, () => store.qualifyOpportunity(input)));
    expect(new Set(results.map((r) => r.delivery.eventId)).size).toBe(1);
    expect(await store.listDeliveries(workspaceId)).toHaveLength(1);
    expect(results[0].delivery).toMatchObject({ mode: "mock", status: "pending" });
    expect((await store.listLeads(workspaceId))[0].attribution.identifiers).toEqual([]);
    expect((await store.listAudit(workspaceId)).some((e) => e.action === "lead.qualified")).toBe(true);
  });
  it("rejects stale stage writes and cross-workspace access", async () => {
    const { workspaceId, opportunity } = await setup();
    const created = await store.createOpportunity(opportunity);
    const input = { workspaceId, opportunityId: created.opportunity.id, actorId: "reviewer", stage: "solution_fit" as const, expectedVersion: 0 };
    expect((await store.updateOpportunityStage(input)).stage).toBe("solution_fit");
    await expect(store.updateOpportunityStage({ ...input, stage: "quotation" })).rejects.toThrow(/Refresh/);
    await expect(store.updateOpportunityStage({ ...input, workspaceId: "wrong" })).rejects.toThrow();
    expect(await store.listDeliveries(workspaceId)).toHaveLength(0);
  });
  it("saves analysis to the Lead while retaining human edits and explicit zero", async () => {
    const { workspaceId, lead } = await setup();
    const message = "We are in Manila exploring ANPR with 0 parking spaces confirmed.";
    const input = { workspaceId, leadId: lead.id, eventId: "message-1", conversationId: "chat:1", channel: "website" as const, displayName: "Fictional buyer", isTest: true, occurredAt: new Date().toISOString(), message };
    const first = await store.saveInquiry(input);
    expect((await store.saveInquiry(input)).id).toBe(first.id);
    await expect(store.saveInquiry({ ...input, message: "Changed content" })).rejects.toThrow();
    const analysis = mockQualification(message);
    await store.completeInquiry(workspaceId, first.id, { analysis, provider: "mock" });
    await store.applyQualification(workspaceId, lead.id, "reviewer", { ...analysis, country: "Philippines" }, 0);
    const second = await store.saveInquiry({ ...input, eventId: "message-2", message: "New message" });
    await store.completeInquiry(workspaceId, second.id, { analysis: { ...analysis, country: null }, provider: "mock" });
    const saved = (await store.listLeads(workspaceId))[0];
    expect(saved.aiQualification?.country).toBeNull();
    expect(saved.confirmedQualification?.country).toBe("Philippines");
    expect(saved.confirmedQualification?.parkingSpaces).toBe(0);
    await expect(store.applyQualification(workspaceId, lead.id, "reviewer", analysis, 0)).rejects.toThrow();
  });
  it("blocks live events for fictional fixtures", async () => {
    const { workspaceId, opportunity } = await setup();
    vi.stubEnv("ADS_MODE", "live");
    const created = await store.createOpportunity(opportunity);
    const result = await store.qualifyOpportunity({ workspaceId, opportunityId: created.opportunity.id, actorId: "reviewer", contactReachable: true, relevantNeed: true, targetBuyer: true, nextAction: "Request drawings" });
    expect(result.delivery).toMatchObject({ status: "skipped", skippedReason: "test_record" });
  });
});
