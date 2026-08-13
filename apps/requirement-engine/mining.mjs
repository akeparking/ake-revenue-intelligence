import crypto from "node:crypto";

const productSignals = [
  { field: "product_direction", value: "parking guidance", patterns: [/parking guidance/i, /ultrasonic/i, /space guidance/i, /车位引导/u, /超声波/u] },
  { field: "product_direction", value: "parking access control", patterns: [/barrier gate/i, /parking access/i, /\b(?:lpr|anpr)\b/i, /license plate/i, /车牌识别/u, /道闸/u] },
  { field: "product_direction", value: "pedestrian access control", patterns: [/turnstile/i, /speed gate/i, /pedestrian access/i, /通道闸/u, /人行门禁/u] },
];

const siteSignals = [
  ["residential", /\b(?:residential|apartment|community|compound)\b/i],
  ["commercial", /\b(?:mall|shopping|commercial|retail)\b/i],
  ["office", /\b(?:office|business park)\b/i],
  ["hotel", /\b(?:hotel|resort)\b/i],
  ["airport", /\bairport\b/i],
  ["hospital", /\bhospital\b/i],
];

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return null;
}

function integerFrom(text, patterns) {
  const match = firstMatch(text, patterns);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

function fieldVersion(state, field) {
  return state?.project?.fields?.[field]?.version ?? 0;
}

function confirmedChange(state, event, field, value, confidence = 0.98) {
  return {
    field,
    value,
    evidence_class: "confirmed",
    confidence,
    source_type: "customer_message",
    source_id: event.sourceId,
    observed_version: fieldVersion(state, field),
  };
}

export function extractProjectChanges(message, state, event) {
  const text = String(message || "").normalize("NFKC");
  const changes = [];
  const parkingSpaces = integerFrom(text, [/(\d{1,6})\s*(?:parking\s*)?(?:spaces|bays|lots)/i, /(\d{1,6})\s*个?车位/u]);
  const entryLanes = integerFrom(text, [/(\d{1,3})\s*(?:entry|entrance|inbound)\s*(?:lanes?|gates?)/i, /(\d{1,3})\s*条?入口/u]);
  const exitLanes = integerFrom(text, [/(\d{1,3})\s*(?:exit|outbound)\s*(?:lanes?|gates?)/i, /(\d{1,3})\s*条?出口/u]);
  const siteCount = integerFrom(text, [/(\d{1,4})\s*(?:sites?|locations?|car parks?)/i, /(\d{1,4})\s*个?(?:项目|停车场)/u]);
  if (parkingSpaces !== undefined) changes.push(confirmedChange(state, event, "parking_spaces", parkingSpaces));
  if (entryLanes !== undefined) changes.push(confirmedChange(state, event, "entry_lanes", entryLanes));
  if (exitLanes !== undefined) changes.push(confirmedChange(state, event, "exit_lanes", exitLanes));
  if (siteCount !== undefined) changes.push(confirmedChange(state, event, "site_count", siteCount));

  const product = productSignals.find((item) => item.patterns.some((pattern) => pattern.test(text)));
  if (product) changes.push(confirmedChange(state, event, product.field, product.value, 0.96));
  const site = siteSignals.find(([, pattern]) => pattern.test(text));
  if (site) changes.push(confirmedChange(state, event, "site_type", site[0], 0.95));

  if (/\b(?:distributor|reseller|dealer|integrator)\b/i.test(text) || /经销|分销|集成商/u.test(text)) {
    changes.push(confirmedChange(state, event, "motion", "distribution", 0.96));
  } else if (/\b(?:our project|this project|retrofit|new build|installation)\b/i.test(text) || /项目|改造|新建/u.test(text)) {
    changes.push(confirmedChange(state, event, "motion", "project", 0.93));
  }

  if (/\b(?:api|sdk|webhook|integration|integrate)\b/i.test(text) || /接口|对接|集成/u.test(text)) {
    changes.push(confirmedChange(state, event, "api_integration", true, 0.98));
  }
  if (/\b(?:oem|white[ -]?label|private label)\b/i.test(text) || /贴牌|定制/u.test(text)) {
    changes.push(confirmedChange(state, event, "oem_customization", true, 0.98));
  }
  if (/\b(?:unmanned|unattended|cashless)\b/i.test(text) || /无人值守/u.test(text)) {
    changes.push(confirmedChange(state, event, "unmanned_scope", true, 0.98));
  }

  const payment = firstMatch(text, [/\b(?:cashless|credit card|qr payment|mobile payment|payment gateway)\b/i, /支付|收款/u]);
  if (payment) changes.push(confirmedChange(state, event, "payment_mode", payment[0].toLowerCase(), 0.9));

  const timeline = firstMatch(text, [/(?:within|in)\s+(\d+\s+(?:days?|weeks?|months?))/i, /(?:next|within)\s+(quarter|month|year)/i, /(\d+\s*(?:天|周|个月|月|年))(?:内|后)?/u]);
  if (timeline) changes.push(confirmedChange(state, event, "target_timeline", timeline[1], 0.94));

  const unique = new Map();
  for (const change of changes) unique.set(change.field, change);
  return [...unique.values()];
}

export function buildKnowledgeQuery(message) {
  const text = String(message || "");
  const terms = [];
  for (const item of productSignals) {
    if (item.patterns.some((pattern) => pattern.test(text))) terms.push(item.value);
  }
  if (/\b(?:api|integration|sdk|webhook)\b/i.test(text) || /接口|对接|集成/u.test(text)) terms.push("system integration API");
  if (/\b(?:payment|cashless|credit card|qr)\b/i.test(text) || /支付|收款/u.test(text)) terms.push("parking payment");
  if (/\b(?:unmanned|unattended)\b/i.test(text) || /无人值守/u.test(text)) terms.push("unmanned parking");
  if (/\b(?:oem|white[ -]?label)\b/i.test(text) || /贴牌|定制/u.test(text)) terms.push("OEM customization");
  return [...new Set(terms)].join(" ") || "parking management system";
}

export function chooseNextQuestion(currentState, changes) {
  const known = new Set(Object.entries(currentState?.project?.fields || {}).filter(([, envelope]) => envelope?.value !== null).map(([field]) => field));
  for (const change of changes) known.add(change.field);
  const candidates = [
    ["motion", "Is this for a specific parking project, or are you evaluating products for distribution?", "Separates project delivery from channel cooperation.", "The correct sales and solution path", [3, 3, 3, 1]],
    ["site_type", "What type of site is this—residential, commercial, hotel, or another setting?", "Site type changes topology and operating assumptions.", "A relevant solution topology", [3, 3, 3, 1]],
    ["project_city", "Which city is the project located in?", "Location affects project context and handoff.", "Regional project support", [2, 3, 2, 1]],
    ["product_direction", "Which part should we focus on first: vehicle access, parking guidance, or pedestrian access?", "Product direction selects the right knowledge and technical owner.", "A focused product recommendation", [3, 3, 3, 1]],
    ["parking_spaces", "Approximately how many parking spaces are involved?", "Scale changes the practical system layout.", "A more accurate system topology", [3, 3, 3, 1]],
    ["entry_lanes", "How many entry and exit lanes are included?", "Lane count is needed for access-control sizing.", "Entrance and exit equipment sizing", [3, 3, 3, 1]],
    ["target_timeline", "When do you expect the project to be ready for procurement or installation?", "Timeline determines follow-up priority and delivery review.", "A realistic next-step plan", [3, 2, 3, 1]],
    ["system_boundary", "Does this need to integrate with an existing parking or payment platform?", "Existing systems define the integration boundary.", "A focused technical review", [3, 3, 3, 2]],
  ];
  const candidate = candidates.find(([field]) => !known.has(field));
  if (!candidate) return null;
  const [field, question, reason, valueUnlocked, scores] = candidate;
  return {
    field,
    question,
    reason,
    value_unlocked: valueUnlocked,
    score: {
      decision_impact: scores[0],
      uncertainty_reduction: scores[1],
      value_unlocked: scores[2],
      customer_effort: scores[3],
    },
  };
}

export function buildProjectDelta(input, currentState) {
  const event = { sourceId: input.eventId };
  const changes = extractProjectChanges(input.message, currentState, event);
  return {
    event_id: input.eventId,
    occurred_at: input.occurredAt,
    source: {
      source_type: "customer_message",
      source_id: input.eventId,
      direction: "inbound",
    },
    observed_revision: currentState.revision,
    observed_field_versions: Object.fromEntries(changes.map((change) => [change.field, change.observed_version])),
    changes: changes.map(({ observed_version: _observed, ...change }) => change),
  };
}

export function buildTurnResult(input, currentState, knowledgeReceipt) {
  const projectDelta = buildProjectDelta(input, currentState);
  const nextBestQuestion = chooseNextQuestion(currentState, projectDelta.changes);
  const complexScope = projectDelta.changes.some((change) => ["api_integration", "oem_customization", "unmanned_scope", "payment_mode"].includes(change.field));
  const turnId = `turn_${crypto.createHash("sha256").update(`${input.workspaceId}:${input.eventId}`).digest("hex").slice(0, 24)}`;
  const intentId = `followup_${crypto.createHash("sha256").update(turnId).digest("hex").slice(0, 24)}`;
  const question = nextBestQuestion?.question || "Would you like us to arrange a focused product review for this scope?";
  const changeCount = projectDelta.changes.length;
  const turn = {
    schema_version: "1.0.0",
    turn_id: turnId,
    contact_id: input.contactId,
    conversation_id: input.conversationId,
    scenario: input.scenario,
    input_event: {
      event_id: input.eventId,
      source_type: "customer_message",
      source_id: input.eventId,
      occurred_at: input.occurredAt,
      direction: "inbound",
    },
    knowledge_receipt: knowledgeReceipt,
    answer: {
      bubbles: [
        changeCount ? `Thanks — I’ve captured ${changeCount} project detail${changeCount === 1 ? "" : "s"} from your message.` : "Thanks — I’ve captured your latest project message.",
        question,
      ],
      claims: [{
        claim_id: `${turnId}:conversation`,
        text: "The customer supplied project information in the current message.",
        classification: "conversation_fact",
        support: [{ source_id: input.eventId }],
      }],
    },
    project_delta: projectDelta,
    next_best_question: nextBestQuestion,
    handoff: {
      required: complexScope,
      reason: complexScope ? "Payment, API, OEM, integration, or unmanned scope requires product or technical review." : "",
      owner: complexScope ? "product-technical" : "",
    },
    action_intent: {
      status: "DRAFT_ONLY",
      intent_id: intentId,
      channel: input.channel === "email" ? "email" : "whatsapp",
      reasons: ["Human review required before sending."],
      knowledge: knowledgeReceipt ? {
        required: true,
        aggregate_hash: knowledgeReceipt.aggregate_hash,
        retrieved_at: knowledgeReceipt.retrieved_at,
      } : { required: false, aggregate_hash: "", retrieved_at: "" },
    },
  };
  return turn;
}
