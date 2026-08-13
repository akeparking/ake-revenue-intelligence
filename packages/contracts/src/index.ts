import { z } from "zod";

export const providers = ["meta", "google", "organic", "manual"] as const;
export type Provider = (typeof providers)[number];

export const leadStatuses = [
  "new",
  "contacted",
  "qualified",
  "converted",
  "no_reply",
  "rejected",
  "spam",
  "merged",
] as const;
export type LeadStatus = (typeof leadStatuses)[number];

export const opportunityStages = [
  "discovery",
  "solution_fit",
  "quotation",
  "negotiation",
  "won",
  "lost",
] as const;
export type OpportunityStage = (typeof opportunityStages)[number];

export const deliveryStatuses = [
  "pending",
  "dispatching",
  "accepted",
  "retrying",
  "dead_letter",
  "skipped",
] as const;
export type DeliveryStatus = (typeof deliveryStatuses)[number];

export const diagnosticStatuses = ["unknown", "matched", "unmatched", "warning"] as const;
export type DiagnosticStatus = (typeof diagnosticStatuses)[number];

export const adIdentifierTypes = [
  "meta_leadgen_id",
  "meta_fbc",
  "meta_fbp",
  "meta_ctwa_clid",
  "google_lead_id",
  "google_gcl_id",
  "google_gclid",
  "google_gbraid",
  "google_wbraid",
  "google_session_attributes",
  "form_id",
  "page_id",
  "campaign_id",
  "ad_group_id",
  "ad_set_id",
  "ad_id",
  "creative_id",
  "asset_group_id",
] as const;
export type AdIdentifierType = (typeof adIdentifierTypes)[number];

export interface AdIdentifierInput {
  type: AdIdentifierType;
  value: string;
}

export interface AttributionInput {
  provider: Provider;
  sourceKind: "instant_form" | "website" | "ctwa" | "chat" | "manual";
  occurredAt: string;
  identifiers: AdIdentifierInput[];
  utm?: Record<string, string>;
  landingUrl?: string;
  referrer?: string;
  consentStatus?: "granted" | "denied" | "unknown";
  metadata?: Record<string, unknown>;
}

export const ingestLeadSchema = z.object({
  workspaceId: z.string().min(1).default("ake-demo"),
  provider: z.enum(providers),
  sourceKind: z.enum(["instant_form", "website", "ctwa", "chat", "manual"]),
  externalLeadId: z.string().min(1).optional(),
  displayName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(6).optional(),
  waId: z.string().min(4).optional(),
  companyName: z.string().min(1).optional(),
  country: z.string().min(2).optional(),
  attribution: z.custom<AttributionInput>(),
  isTest: z.boolean().default(false),
});
export type IngestLeadInput = z.infer<typeof ingestLeadSchema>;

export const createOpportunitySchema = z
  .object({
    workspaceId: z.string().min(1).default("ake-demo"),
    personId: z.string().min(1).optional(),
    companyId: z.string().min(1).optional(),
    primarySourceLeadId: z.string().min(1),
    name: z.string().min(3),
    direction: z.string().min(2),
    country: z.string().min(2),
    ownerId: z.string().min(1),
    nextAction: z.string().min(2).optional(),
    expectedTimeline: z.string().min(2).optional(),
    amount: z.number().nonnegative().optional(),
    currency: z.string().length(3).default("USD"),
  })
  .refine((value) => Boolean(value.personId || value.companyId), {
    message: "personId or companyId is required",
    path: ["personId"],
  })
  .refine((value) => Boolean(value.nextAction || value.expectedTimeline), {
    message: "nextAction or expectedTimeline is required",
    path: ["nextAction"],
  });
export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;

export const createTaskSchema = z.object({
  workspaceId: z.string().min(1).default("ake-demo"),
  leadId: z.string().min(1).optional(),
  opportunityId: z.string().min(1).optional(),
  title: z.string().min(2),
  ownerId: z.string().min(1),
  dueAt: z.string().datetime().optional(),
}).refine((value) => Boolean(value.leadId || value.opportunityId), { message: "leadId or opportunityId is required" });
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const createNoteSchema = z.object({
  workspaceId: z.string().min(1).default("ake-demo"),
  leadId: z.string().min(1).optional(),
  opportunityId: z.string().min(1).optional(),
  authorId: z.string().min(1),
  body: z.string().min(1).max(10_000),
}).refine((value) => Boolean(value.leadId || value.opportunityId), { message: "leadId or opportunityId is required" });
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export interface LeadRecord {
  id: string;
  workspaceId: string;
  personId?: string;
  companyId?: string;
  provider: Provider;
  sourceKind: AttributionInput["sourceKind"];
  externalLeadId?: string;
  displayName: string;
  emailMasked?: string;
  phoneMasked?: string;
  companyName?: string;
  country?: string;
  status: LeadStatus;
  mergeReviewRequired: boolean;
  isTest: boolean;
  createdAt: string;
  attribution: AttributionSummary;
}

export interface AttributionSummary {
  id: string;
  provider: Provider;
  sourceKind: AttributionInput["sourceKind"];
  occurredAt: string;
  identifiers: Array<{ type: AdIdentifierType; preview: string }>;
  campaignId?: string;
  formId?: string;
}

export interface OpportunityRecord {
  id: string;
  workspaceId: string;
  personId?: string;
  companyId?: string;
  primarySourceLeadId: string;
  name: string;
  direction: string;
  country: string;
  ownerId: string;
  nextAction?: string;
  expectedTimeline?: string;
  amount?: number;
  currency: string;
  stage: OpportunityStage;
  createdAt: string;
}

export interface PersonRecord {
  id: string;
  workspaceId: string;
  companyId?: string;
  displayName: string;
  emailMasked?: string;
  phoneMasked?: string;
  createdAt: string;
}

export interface CompanyRecord {
  id: string;
  workspaceId: string;
  name: string;
  country?: string;
  createdAt: string;
}

export interface OrderMirrorRecord {
  id: string;
  workspaceId: string;
  opportunityId?: string;
  erpProvider: string;
  externalOrderId: string;
  status: string;
  amount?: number;
  currency?: string;
  syncedAt: string;
}

export interface TaskRecord {
  id: string;
  workspaceId: string;
  leadId?: string;
  opportunityId?: string;
  title: string;
  ownerId: string;
  status: "open" | "done";
  dueAt?: string;
  createdAt: string;
}

export interface NoteRecord {
  id: string;
  workspaceId: string;
  leadId?: string;
  opportunityId?: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export const requirementScenarios = ["WHATSAPP_FOLLOWUP", "FORM_RESEARCH_OUTBOUND"] as const;
export type RequirementScenario = (typeof requirementScenarios)[number];

export const analyzeRequirementSchema = z.object({
  leadId: z.string().min(1),
  conversationId: z.string().min(1),
  eventId: z.string().min(1),
  occurredAt: z.string().datetime(),
  message: z.string().min(1).max(20_000),
  scenario: z.enum(requirementScenarios).default("WHATSAPP_FOLLOWUP"),
  channel: z.enum(["whatsapp", "email", "chat", "form"]).default("whatsapp"),
});
export type AnalyzeRequirementInput = z.infer<typeof analyzeRequirementSchema>;

export interface ProjectFieldEvidenceRef {
  source_type: string;
  source_id: string;
  uri?: string;
  content_hash?: string;
  line_start?: number;
  line_end?: number;
}

export interface ProjectFieldEnvelope {
  value: unknown;
  evidence_class: "confirmed" | "inferred" | "unverified" | "unknown";
  confidence: number;
  version: number;
  evidence_refs: ProjectFieldEvidenceRef[];
  updated_at: string;
}

export interface CustomerProjectState {
  schema_version: "1.0.0";
  contact_id: string;
  conversation_id: string;
  revision: number;
  identity: Record<string, unknown>;
  discovery: {
    stage: string;
    current_objective: string;
    deferred_fields: string[];
    next_value_hook: string;
  };
  project: { fields: Record<string, ProjectFieldEnvelope> };
  interactions: Array<Record<string, unknown>>;
  conflicts: Array<Record<string, unknown>>;
  applied_event_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface RequirementEvidenceSource {
  title: string;
  sourceUri: string;
  lineStart: number;
  lineEnd: number;
  contentHash: string;
}

export interface RequirementProfileRecord {
  leadId: string;
  conversationId: string;
  revision: number;
  fields: Record<string, ProjectFieldEnvelope>;
  conflicts: Array<Record<string, unknown>>;
  latestTurn?: {
    turnId: string;
    eventId: string;
    status: "committed" | "replayed";
    nextBestQuestion: Record<string, unknown> | null;
    handoff: Record<string, unknown>;
    answerBubbles: string[];
    knowledge: {
      answerability: string;
      aggregateHash: string;
      retrievedAt: string;
      sources: RequirementEvidenceSource[];
    } | null;
    committedAt: string;
  };
}

export interface RequirementCommitReceipt {
  adapter: "postgres" | "memory";
  bundleId: string;
  idempotencyKey: string;
  status: "committed" | "replayed";
  leadId: string;
  eventId: string;
  customerProjectRevision: number;
  interactionEventId: string;
  followupIntentId: string;
  knowledgeAggregateHash: string | null;
  committedAt: string;
  readbackAt: string;
  profile: RequirementProfileRecord;
}

export interface ConversionDeliveryRecord {
  id: string;
  workspaceId: string;
  eventId: string;
  eventType: "LeadQualified";
  provider: Provider;
  primarySourceLeadId: string;
  opportunityId: string;
  status: DeliveryStatus;
  diagnosticStatus: DiagnosticStatus;
  attemptCount: number;
  nextRetryAt?: string;
  providerResponseId?: string;
  providerErrorCode?: string;
  providerErrorMessage?: string;
  skippedReason?: string;
  payloadPreview?: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSnapshot {
  metrics: {
    totalLeads: number;
    qualifiedLeads: number;
    opportunities: number;
    acceptedDeliveries: number;
    failedDeliveries: number;
  };
  leads: LeadRecord[];
  opportunities: OpportunityRecord[];
  deliveries: ConversionDeliveryRecord[];
}

export function normalizeEmail(value?: string): string | undefined {
  return value?.trim().toLowerCase() || undefined;
}

export function normalizePhone(value?: string): string | undefined {
  if (!value) return undefined;
  const hasPlus = value.trim().startsWith("+");
  const digits = value.replace(/\D/g, "");
  return digits ? `${hasPlus ? "+" : "+"}${digits}` : undefined;
}

export function maskEmail(value?: string): string | undefined {
  const normalized = normalizeEmail(value);
  if (!normalized) return undefined;
  const [local, domain] = normalized.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

export function maskPhone(value?: string): string | undefined {
  const normalized = normalizePhone(value);
  if (!normalized) return undefined;
  return `${normalized.slice(0, 3)}•••${normalized.slice(-4)}`;
}

export function identifierPreview(value: string): string {
  if (value.length <= 8) return `${value.slice(0, 2)}•••`;
  return `${value.slice(0, 4)}•••${value.slice(-4)}`;
}
