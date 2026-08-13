import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { buildKnowledgeQuery, buildTurnResult } from "./mining.mjs";
import { queryCanonicalFiles } from "./knowledge.mjs";

const port = Number(process.env.PORT || 4200);
const token = process.env.REQUIREMENT_ENGINE_TOKEN || "";
const skillRoot = process.env.AKE_FOLLOWUP_SKILL_ROOT || "/opt/ake-followup";
const qmdExecutable = process.env.QMD_EXECUTABLE || "/opt/qmd/bin/qmd";
const qmdConfigDir = process.env.QMD_CONFIG_DIR || "/runtime-qmd";
const knowledgeRoot = process.env.AKE_KNOWLEDGE_ROOT || "/knowledge";

if (!token) throw new Error("REQUIREMENT_ENGINE_TOKEN is required");

const knowledgeModule = await import(pathToFileURL(join(skillRoot, "scripts/query_knowledge.mjs")).href);
const deltaModule = await import(pathToFileURL(join(skillRoot, "scripts/apply_project_delta.mjs")).href);
const turnModule = await import(pathToFileURL(join(skillRoot, "scripts/check_turn_result.mjs")).href);

const knowledgeConfig = {
  adapter: "qmd-cli",
  repository_root: knowledgeRoot,
  qmd_executable: qmdExecutable,
  qmd_config_dir: qmdConfigDir,
  canonical_collection: "ake-canonical",
  evidence_collection: "ake-evidence",
  default_retrieval: "lexical",
  candidate_limit: 20,
  result_limit: 3,
  max_document_lines: 120,
  timeout_ms: 30_000,
  allow_evidence_drafting: false,
};

let qmdCompatible = true;
let knowledgeProbe;

function queryApprovedKnowledge(query, limit = 3) {
  if (qmdCompatible) {
    try {
      return knowledgeModule.queryKnowledge({ query, intent: "answer", config: knowledgeConfig, limit });
    } catch {
      qmdCompatible = false;
    }
  }
  return queryCanonicalFiles({ query, repositoryRoot: knowledgeRoot, limit });
}

try {
  knowledgeProbe = queryApprovedKnowledge("parking guidance", 1);
} catch {
  knowledgeProbe = null;
}

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function authorized(request) {
  return request.headers["x-engine-key"] === token;
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("request_too_large");
  }
  return JSON.parse(body || "{}");
}

function health() {
  return {
    status: "ok",
    service: "ake-requirement-engine",
    skillReady: existsSync(join(skillRoot, "SKILL.md")),
    knowledgeReady: Boolean(knowledgeProbe?.results?.length) && existsSync(join(knowledgeRoot, "30-canonical")),
    canonicalCollection: "ake-canonical",
    knowledgeAdapter: knowledgeProbe?.adapter || "unavailable",
    qmdCompatible,
    probeResultCount: knowledgeProbe?.results?.length || 0,
    customerMessagesLogged: false,
    autoSend: false,
  };
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") return json(response, 200, health());
    if (!authorized(request)) return json(response, 401, { error: "unauthorized" });
    if (request.method !== "POST" || request.url !== "/analyze") return json(response, 404, { error: "not_found" });

    const input = await readJson(request);
    if (!input?.message || !input?.eventId || !input?.currentState) return json(response, 400, { error: "invalid_requirement_input" });
    const knowledgeQuery = buildKnowledgeQuery(input.message);
    const knowledgeReceipt = queryApprovedKnowledge(knowledgeQuery, 3);
    const turnResult = buildTurnResult(input, input.currentState, knowledgeReceipt);
    const turnCheck = turnModule.checkTurnResult(turnResult);
    if (!turnCheck.ok) return json(response, 422, { error: "invalid_turn_result", details: turnCheck.errors });
    const deltaResult = deltaModule.applyProjectDelta(input.currentState, turnResult.project_delta, { now: input.occurredAt });
    if (!deltaResult.ok) return json(response, 409, { error: "project_delta_rejected", details: deltaResult.errors });
    deltaResult.state.discovery = {
      stage: turnResult.handoff.required ? "technical_review" : "progressive_discovery",
      current_objective: turnResult.next_best_question?.field || "human_review",
      deferred_fields: turnResult.next_best_question ? [turnResult.next_best_question.field] : [],
      next_value_hook: turnResult.next_best_question?.value_unlocked || "Focused product review",
    };
    return json(response, 200, {
      turnResult,
      nextState: deltaResult.state,
      engineReceipt: {
        status: "validated",
        skillContractVersion: "1.0.0",
        canonicalCollection: knowledgeReceipt.collection,
        knowledgeAggregateHash: knowledgeReceipt.aggregate_hash,
        extractedFieldCount: turnResult.project_delta.changes.length,
        replayed: deltaResult.replayed,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "requirement_engine_failed";
    return json(response, message === "request_too_large" ? 413 : 500, { error: message });
  }
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`ake-requirement-engine listening on ${port}\n`);
});
