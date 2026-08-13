import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRevenueStore } from "../store/memory.store";
import { RequirementsService } from "./requirements.service";

const occurredAt = "2026-08-13T00:00:00.000Z";

describe("RequirementsService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.REQUIREMENT_ENGINE_TOKEN;
    delete process.env.REQUIREMENT_ENGINE_URL;
  });

  it("commits one requirement turn and replays the same event id without a second engine call", async () => {
    process.env.REQUIREMENT_ENGINE_TOKEN = "test-token";
    process.env.REQUIREMENT_ENGINE_URL = "http://requirement-engine:4200";
    const store = new MemoryRevenueStore();
    const lead = await store.ingestLead({
      workspaceId: "ake-demo",
      provider: "organic",
      sourceKind: "chat",
      displayName: "Test buyer",
      attribution: { provider: "organic", sourceKind: "chat", occurredAt, identifiers: [] },
      isTest: true,
    });
    const context = await store.getRequirementContext("ake-demo", lead.id, `crm:${lead.id}`);
    const nextState = structuredClone(context!.state);
    nextState.revision = 1;
    nextState.applied_event_ids.push("evt-1");
    nextState.updated_at = occurredAt;
    const turnResult = {
      turn_id: "turn-1",
      knowledge_receipt: { aggregate_hash: "a".repeat(64), answerability: "GROUNDING_CANDIDATES", retrieved_at: occurredAt, results: [] },
      next_best_question: { field: "site_type", question: "What type of site is this?" },
      handoff: { required: false, reason: "", owner: "" },
      answer: { bubbles: ["Thanks.", "What type of site is this?"] },
      action_intent: { intent_id: "followup-1", channel: "whatsapp", status: "DRAFT_ONLY" },
    };
    const engineFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ turnResult, nextState }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", engineFetch);
    const service = new RequirementsService(store);
    const input = {
      leadId: lead.id,
      conversationId: `crm:${lead.id}`,
      eventId: "evt-1",
      occurredAt,
      message: "We need parking guidance for 800 spaces.",
      scenario: "WHATSAPP_FOLLOWUP" as const,
      channel: "whatsapp" as const,
    };
    const committed = await service.analyze(input, "ake-demo", "ake-admin");
    const replayed = await service.analyze(input, "ake-demo", "ake-admin");
    expect(committed.status).toBe("committed");
    expect(committed.customerProjectRevision).toBe(1);
    expect(replayed.status).toBe("replayed");
    expect(engineFetch).toHaveBeenCalledTimes(1);
  });
});
