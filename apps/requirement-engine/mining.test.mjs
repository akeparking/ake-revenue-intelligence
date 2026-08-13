import assert from "node:assert/strict";
import test from "node:test";
import { buildKnowledgeQuery, buildTurnResult, extractProjectChanges } from "./mining.mjs";

const state = {
  schema_version: "1.0.0",
  contact_id: "contact-1",
  conversation_id: "conversation-1",
  revision: 0,
  identity: {},
  discovery: { stage: "identity", current_objective: "", deferred_fields: [], next_value_hook: "" },
  project: { fields: {} },
  interactions: [],
  conflicts: [],
  applied_event_ids: [],
  created_at: "2026-08-13T00:00:00.000Z",
  updated_at: "2026-08-13T00:00:00.000Z",
};

test("extracts explicit zero without collapsing it to unknown", () => {
  const changes = extractProjectChanges("The retrofit has 0 exit lanes and 2 entry lanes.", state, { sourceId: "evt-1" });
  assert.equal(changes.find((item) => item.field === "exit_lanes")?.value, 0);
  assert.equal(changes.find((item) => item.field === "entry_lanes")?.value, 2);
});

test("builds a PII-free canonical query from technical signals", () => {
  const query = buildKnowledgeQuery("John at john@example.com needs API integration for 800 parking spaces.");
  assert.equal(query, "system integration API");
  assert.equal(query.includes("john"), false);
});

test("emits one progressive question and a draft-only action", () => {
  const knowledge = {
    adapter: "qmd-cli",
    collection: "ake-canonical",
    query: "parking management system",
    retrieved_at: "2026-08-13T00:00:01.000Z",
    aggregate_hash: "a".repeat(64),
    answerability: "GROUNDING_CANDIDATES",
    results: [],
  };
  const turn = buildTurnResult({
    workspaceId: "ake-demo",
    contactId: "contact-1",
    conversationId: "conversation-1",
    eventId: "evt-2",
    occurredAt: "2026-08-13T00:00:00.000Z",
    message: "We need parking guidance for 800 spaces.",
    scenario: "WHATSAPP_FOLLOWUP",
    channel: "whatsapp",
  }, state, knowledge);
  assert.equal(turn.action_intent.status, "DRAFT_ONLY");
  assert.equal(turn.answer.bubbles.filter((bubble) => bubble.includes("?")).length, 1);
  assert.equal(turn.project_delta.changes.some((item) => item.field === "parking_spaces" && item.value === 800), true);
});
