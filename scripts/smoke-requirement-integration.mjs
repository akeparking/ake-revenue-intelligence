import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const envPath = process.env.AKE_CRM_ENV_FILE || resolve(projectRoot, ".env.local");

function parseEnv(path) {
  const values = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, init = {}) {
  const response = await fetch(`http://127.0.0.1:4100${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "x-workspace-id": "ake-demo",
      "x-user-id": "requirements-smoke",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(45_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method || "GET"} ${path} failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
}

const env = parseEnv(envPath);
const apiKey = process.env.API_KEY || env.API_KEY;
const postgresUser = process.env.POSTGRES_USER || env.POSTGRES_USER;
assert(apiKey, "API_KEY is missing from the local environment file");
assert(postgresUser, "POSTGRES_USER is missing from the local environment file");

const occurredAt = "2026-08-13T02:40:00.000Z";
const externalLeadId = "requirement-integration-smoke-v1";
const eventId = "requirement-integration-smoke-v1:event-1";
const message = "We need parking guidance for 800 spaces at a residential site, with 2 entry lanes and 0 exit lanes. API integration is required within 3 months.";

const webResponse = await fetch("http://127.0.0.1:3000", { signal: AbortSignal.timeout(10_000) });
assert(webResponse.ok, `Workspace Web is not reachable (${webResponse.status})`);

const health = await request("/api/v1/requirements/health");
assert(health.healthy === true, "Revenue Core cannot reach the requirement engine");
assert(health.skillReady === true, "The installed ake-customer-followup Skill mount is not ready");
assert(health.knowledgeReady === true, "The approved Canonical knowledge snapshot is not ready");

const lead = await request("/api/v1/leads", {
  method: "POST",
  body: JSON.stringify({
    provider: "organic",
    sourceKind: "chat",
    externalLeadId,
    displayName: "Requirement Integration Smoke",
    companyName: "AKE Test Fixture",
    country: "AE",
    attribution: {
      provider: "organic",
      sourceKind: "chat",
      occurredAt,
      identifiers: [],
      consentStatus: "unknown",
    },
    isTest: true,
  }),
});
assert(lead.id, "Lead ingestion did not return an ID");

const conversationId = `smoke:${lead.id}`;
const analyzePayload = {
  leadId: lead.id,
  conversationId,
  eventId,
  occurredAt,
  message,
  scenario: "WHATSAPP_FOLLOWUP",
  channel: "whatsapp",
};
const first = await request("/api/v1/requirements/analyze", { method: "POST", body: JSON.stringify(analyzePayload) });
const replay = await request("/api/v1/requirements/analyze", { method: "POST", body: JSON.stringify(analyzePayload) });
const profile = await request(`/api/v1/requirements/${encodeURIComponent(lead.id)}?conversationId=${encodeURIComponent(conversationId)}`);

assert(["committed", "replayed"].includes(first.status), "First commit returned an invalid status");
assert(replay.status === "replayed", "Second submission did not replay the existing receipt");
assert(first.bundleId === replay.bundleId, "Idempotent replay returned a different bundle");
assert(first.customerProjectRevision === replay.customerProjectRevision, "Idempotent replay changed the project revision");
assert(profile.revision === first.customerProjectRevision, "Profile readback revision does not match the commit receipt");
assert(profile.fields?.parking_spaces?.value === 800, "parking_spaces was not committed as 800");
assert(profile.fields?.entry_lanes?.value === 2, "entry_lanes was not committed as 2");
assert(profile.fields?.exit_lanes?.value === 0, "Explicit zero for exit_lanes was not preserved");
assert(profile.fields?.api_integration?.value === true, "api_integration was not committed");
assert(profile.latestTurn?.knowledge?.sources?.length > 0, "No Canonical knowledge sources were recorded");
assert(profile.latestTurn?.handoff?.required === true, "Complex API scope did not require technical handoff");
assert(profile.latestTurn?.nextBestQuestion?.question, "No single next-best question was produced");
assert(!JSON.stringify(profile).includes(message), "Raw customer message leaked into the profile read API");
assert(/^followup_[a-f0-9]+$/.test(first.followupIntentId), "Unexpected follow-up intent ID format");

const sql = [
  "SELECT",
  `  (SELECT count(*) FROM requirement_turns WHERE workspace_id = 'ake-demo' AND event_id = '${eventId}'),`,
  `  (SELECT count(*) FROM requirement_interactions WHERE workspace_id = 'ake-demo' AND event_id = '${eventId}'),`,
  `  (SELECT count(*) FROM requirement_followups WHERE workspace_id = 'ake-demo' AND intent_id = '${first.followupIntentId}'),`,
  `  (SELECT left(message_ciphertext, 4) FROM requirement_interactions WHERE workspace_id = 'ake-demo' AND event_id = '${eventId}');`,
].join("\n");
const databaseReadback = execFileSync("docker", [
  "compose",
  "--env-file", envPath,
  "-f", resolve(projectRoot, "compose.yaml"),
  "-f", resolve(projectRoot, "compose.local.yaml"),
  "exec", "-T", "postgres",
  "psql", "-U", postgresUser, "-d", "revenue_crm", "-At", "-F", "|", "-c", sql,
], { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
assert(databaseReadback === "1|1|1|gcm:", `Unexpected database readback: ${databaseReadback}`);

console.log(JSON.stringify({
  workspaceWeb: "reachable",
  leadId: lead.id,
  requirementEngine: {
    healthy: health.healthy,
    skillReady: health.skillReady,
    knowledgeReady: health.knowledgeReady,
    knowledgeAdapter: health.knowledgeAdapter,
    qmdCompatible: health.qmdCompatible,
  },
  firstStatus: first.status,
  replayStatus: replay.status,
  sameBundle: first.bundleId === replay.bundleId,
  revision: profile.revision,
  fields: {
    parking_spaces: profile.fields.parking_spaces.value,
    entry_lanes: profile.fields.entry_lanes.value,
    exit_lanes: profile.fields.exit_lanes.value,
    api_integration: profile.fields.api_integration.value,
  },
  nextBestQuestion: profile.latestTurn.nextBestQuestion.question,
  technicalHandoffRequired: profile.latestTurn.handoff.required,
  knowledgeSourceCount: profile.latestTurn.knowledge.sources.length,
  knowledgeHashPrefix: profile.latestTurn.knowledge.aggregateHash.slice(0, 12),
  databaseReadback,
  rawMessageExposedByProfile: false,
}, null, 2));
