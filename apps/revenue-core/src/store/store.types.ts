import type {
  AttributionInput,
  ConversionDeliveryRecord,
  CreateOpportunityInput,
  CreateNoteInput,
  CreateTaskInput,
  CompanyRecord,
  DashboardSnapshot,
  IngestLeadInput,
  LeadRecord,
  OpportunityRecord,
  OrderMirrorRecord,
  NoteRecord,
  PersonRecord,
  Provider,
  TaskRecord,
  CustomerProjectState,
  RequirementCommitReceipt,
  RequirementProfileRecord,
  CreateInquiryInput, InquiryRecord, QualificationAnalysis, QualificationFields,
  QualifyOpportunityInput, StageChangeInput,
} from "@ake/contracts";

export interface RawEventInput {
  workspaceId: string;
  provider: string;
  eventType: string;
  externalEventId?: string;
  payload: unknown;
  payloadHash: string;
  receivedAt: string;
}

export interface InternalLead extends LeadRecord {
  email?: string;
  phone?: string;
  waId?: string;
  rawAttribution: AttributionInput;
}

export interface QualifiedContext {
  delivery: ConversionDeliveryRecord;
  lead: InternalLead;
  opportunity: OpportunityRecord;
  identifiers: Array<{ type: string; value: string }>;
}

export interface OpportunityCreationResult {
  opportunity: OpportunityRecord;
  delivery?: ConversionDeliveryRecord;
  deduplicated: boolean;
}

export interface RequirementContext {
  lead: InternalLead;
  state: CustomerProjectState;
}

export interface RequirementCommitInput {
  workspaceId: string;
  actorId: string;
  leadId: string;
  conversationId: string;
  eventId: string;
  occurredAt: string;
  message: string;
  turnResult: Record<string, any>;
  nextState: CustomerProjectState;
}

export interface DeliveryUpdate {
  status?: ConversionDeliveryRecord["status"];
  diagnosticStatus?: ConversionDeliveryRecord["diagnosticStatus"];
  attemptCount?: number;
  nextRetryAt?: string;
  providerResponseId?: string;
  providerErrorCode?: string;
  providerErrorMessage?: string;
  payloadPreview?: Record<string, unknown>;
}

export interface RevenueStore {
  saveRawEvent(input: RawEventInput): Promise<void>;
  ingestLead(input: IngestLeadInput): Promise<LeadRecord>;
  listLeads(workspaceId: string): Promise<LeadRecord[]>;
  getLeadInternal(workspaceId: string, leadId: string): Promise<InternalLead | undefined>;
  createOpportunity(input: CreateOpportunityInput): Promise<OpportunityCreationResult>;
  qualifyOpportunity(input: QualifyOpportunityInput): Promise<OpportunityCreationResult & { delivery: ConversionDeliveryRecord }>;
  updateOpportunityStage(input: StageChangeInput): Promise<OpportunityRecord>;
  saveInquiry(input: CreateInquiryInput & { workspaceId: string; leadId: string; deferAnalysis?: boolean }): Promise<InquiryRecord>;
  listInquiries(workspaceId: string): Promise<InquiryRecord[]>;
  claimInquiry(): Promise<InquiryRecord | undefined>;
  completeInquiry(workspaceId: string, id: string, result: { analysis?: QualificationAnalysis; provider: string; error?: string }): Promise<InquiryRecord>;
  applyQualification(workspaceId: string, leadId: string, actorId: string, fields: QualificationFields, expectedRevision: number): Promise<LeadRecord>;
  listOpportunities(workspaceId: string): Promise<OpportunityRecord[]>;
  listPersons(workspaceId: string): Promise<PersonRecord[]>;
  listCompanies(workspaceId: string): Promise<CompanyRecord[]>;
  listOrders(workspaceId: string): Promise<OrderMirrorRecord[]>;
  upsertOrderMirror(input: Omit<OrderMirrorRecord, "id" | "syncedAt">): Promise<OrderMirrorRecord>;
  listTasks(workspaceId: string): Promise<TaskRecord[]>;
  createTask(input: CreateTaskInput): Promise<TaskRecord>;
  listNotes(workspaceId: string): Promise<NoteRecord[]>;
  createNote(input: CreateNoteInput): Promise<NoteRecord>;
  getRequirementContext(workspaceId: string, leadId: string, conversationId: string): Promise<RequirementContext | undefined>;
  getRequirementProfile(workspaceId: string, leadId: string, conversationId?: string): Promise<RequirementProfileRecord | undefined>;
  getRequirementReceiptByEvent(workspaceId: string, eventId: string): Promise<RequirementCommitReceipt | undefined>;
  commitRequirementTurn(input: RequirementCommitInput): Promise<RequirementCommitReceipt>;
  listAudit(workspaceId: string): Promise<Array<Record<string, unknown>>>;
  listDeliveries(workspaceId: string): Promise<ConversionDeliveryRecord[]>;
  getQualifiedContext(deliveryId: string): Promise<QualifiedContext | undefined>;
  claimPendingDeliveries(limit: number): Promise<ConversionDeliveryRecord[]>;
  updateDelivery(deliveryId: string, update: DeliveryUpdate): Promise<ConversionDeliveryRecord>;
  replayDelivery(workspaceId: string, deliveryId: string): Promise<ConversionDeliveryRecord>;
  getDashboard(workspaceId: string): Promise<DashboardSnapshot>;
  close(): Promise<void>;
}

export const REVENUE_STORE = Symbol("REVENUE_STORE");

export function createInitialProjectState(contactId: string, conversationId: string, now = new Date().toISOString()): CustomerProjectState {
  return {
    schema_version: "1.0.0",
    contact_id: contactId,
    conversation_id: conversationId,
    revision: 0,
    identity: { match_decision: "unresolved", confidence: "unresolved", evidence_refs: [] },
    discovery: { stage: "identity", current_objective: "", deferred_fields: [], next_value_hook: "" },
    project: { fields: {} },
    interactions: [],
    conflicts: [],
    applied_event_ids: [],
    created_at: now,
    updated_at: now,
  };
}

export function isAdsProvider(provider: Provider): provider is "meta" | "google" {
  return provider === "meta" || provider === "google";
}

export function hasFeedbackAttribution(lead: InternalLead): boolean {
  const types = new Set(lead.rawAttribution.identifiers.map((item) => item.type));
  if (lead.provider === "meta") {
    return (["meta_leadgen_id", "meta_fbc", "meta_fbp", "meta_ctwa_clid"] as const).some((type) => types.has(type));
  }
  if (lead.provider === "google") {
    return (["google_lead_id", "google_gcl_id", "google_gclid", "google_gbraid", "google_wbraid", "google_session_attributes"] as const).some((type) => types.has(type));
  }
  return false;
}
