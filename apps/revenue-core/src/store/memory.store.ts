import { randomUUID } from "node:crypto";
import { ConflictException, NotFoundException, BadRequestException } from "@nestjs/common";
import { loadConfig } from "../config";
import {
  identifierPreview,
  maskEmail,
  maskPhone,
  normalizeEmail,
  normalizePhone,
  type ConversionDeliveryRecord,
  type CompanyRecord,
  type CreateNoteInput,
  type CreateOpportunityInput,
  type CreateTaskInput,
  type DashboardSnapshot,
  type IngestLeadInput,
  type LeadRecord,
  type OpportunityRecord,
  type OrderMirrorRecord,
  type NoteRecord,
  type PersonRecord,
  type TaskRecord,
  type CustomerProjectState,
  type RequirementCommitReceipt,
  type RequirementProfileRecord,
  type CreateInquiryInput, type InquiryRecord, type QualificationAnalysis, type QualificationFields,
  type QualifyOpportunityInput, type StageChangeInput,
} from "@ake/contracts";
import type {
  DeliveryUpdate,
  InternalLead,
  OpportunityCreationResult,
  QualifiedContext,
  RawEventInput,
  RequirementCommitInput,
  RevenueStore,
} from "./store.types";
import { createInitialProjectState, hasFeedbackAttribution, isAdsProvider } from "./store.types";

export class MemoryRevenueStore implements RevenueStore {
  private readonly inquiries = new Map<string, InquiryRecord>();
  private readonly auditEvents: Array<Record<string, unknown>> = [];
  private readonly leads = new Map<string, InternalLead>();
  private readonly opportunities = new Map<string, OpportunityRecord>();
  private readonly deliveries = new Map<string, ConversionDeliveryRecord>();
  private readonly orders = new Map<string, OrderMirrorRecord>();
  private readonly tasks = new Map<string, TaskRecord>();
  private readonly notes = new Map<string, NoteRecord>();
  private readonly rawEvents: RawEventInput[] = [];
  private readonly requirementStates = new Map<string, CustomerProjectState>();
  private readonly requirementProfiles = new Map<string, RequirementProfileRecord>();
  private readonly requirementReceipts = new Map<string, RequirementCommitReceipt>();

  async saveRawEvent(input: RawEventInput): Promise<void> {
    if (
      input.externalEventId &&
      this.rawEvents.some(
        (event) =>
          event.workspaceId === input.workspaceId &&
          event.provider === input.provider &&
          event.externalEventId === input.externalEventId,
      )
    ) {
      return;
    }
    this.rawEvents.push(structuredClone(input));
  }

  async ingestLead(input: IngestLeadInput): Promise<LeadRecord> {
    const duplicate = [...this.leads.values()].find(
      (lead) =>
        Boolean(input.externalLeadId) &&
        lead.workspaceId === input.workspaceId &&
        lead.provider === input.provider &&
        lead.externalLeadId === input.externalLeadId,
    );
    if (duplicate) return this.publicLead(duplicate);

    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    const exactMatches = [...this.leads.values()].filter(
      (lead) =>
        lead.workspaceId === input.workspaceId &&
        ((input.waId && lead.waId === input.waId) ||
          (email && lead.email === email) ||
          (phone && lead.phone === phone)),
    );
    const matchingPersonIds = [...new Set(exactMatches.map((lead) => lead.personId).filter(Boolean))];
    const personId = matchingPersonIds.length === 1 ? matchingPersonIds[0] : `person_${randomUUID()}`;
    const companyId = input.companyName ? `company_${randomUUID()}` : undefined;
    const attributionId = `touch_${randomUUID()}`;
    const identifiers = input.attribution.identifiers.map((item) => ({
      type: item.type,
      preview: identifierPreview(item.value),
    }));
    const campaignId = input.attribution.identifiers.find((item) => item.type === "campaign_id")?.value;
    const formId = input.attribution.identifiers.find((item) => item.type === "form_id")?.value;
    const createdAt = new Date().toISOString();
    const lead: InternalLead = {
      id: `lead_${randomUUID()}`,
      workspaceId: input.workspaceId,
      personId,
      companyId,
      provider: input.provider,
      sourceKind: input.sourceKind,
      externalLeadId: input.externalLeadId,
      displayName: input.displayName,
      email,
      phone,
      waId: input.waId,
      emailMasked: maskEmail(email),
      phoneMasked: maskPhone(phone),
      companyName: input.companyName,
      country: input.country,
      status: "new",
      mergeReviewRequired: matchingPersonIds.length > 1,
      isTest: input.isTest,
      createdAt,
      rawAttribution: structuredClone(input.attribution),
      attribution: {
        id: attributionId,
        provider: input.provider,
        sourceKind: input.sourceKind,
        occurredAt: input.attribution.occurredAt,
        identifiers,
        campaignId,
        formId,
      },
    };
    this.leads.set(lead.id, lead);
    return this.publicLead(lead);
  }

  async listLeads(workspaceId: string): Promise<LeadRecord[]> {
    return [...this.leads.values()]
      .filter((lead) => lead.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((lead) => this.publicLead(lead));
  }

  async getLeadInternal(workspaceId: string, leadId: string): Promise<InternalLead | undefined> {
    const lead = this.leads.get(leadId);
    return lead?.workspaceId === workspaceId ? structuredClone(lead) : undefined;
  }

  async createOpportunity(input: CreateOpportunityInput): Promise<OpportunityCreationResult> {
    const lead = this.leads.get(input.primarySourceLeadId);
    if (!lead || lead.workspaceId !== input.workspaceId) throw new Error("Primary source lead not found");
    if (input.personId && input.personId !== lead.personId) throw new Error("Lead does not belong to person");
    if (input.companyId && input.companyId !== lead.companyId) throw new Error("Lead does not belong to company");

    const duplicate = [...this.opportunities.values()].find((item) => item.workspaceId === input.workspaceId && item.primarySourceLeadId === lead.id);
    if (duplicate) return { opportunity: structuredClone(duplicate), deduplicated: true };
    const createdAt = new Date().toISOString();
    const opportunity: OpportunityRecord = {
      id: `opp_${randomUUID()}`,
      workspaceId: input.workspaceId,
      personId: input.personId,
      companyId: input.companyId,
      primarySourceLeadId: input.primarySourceLeadId,
      name: input.name,
      direction: input.direction,
      country: input.country,
      ownerId: input.ownerId,
      nextAction: input.nextAction,
      expectedTimeline: input.expectedTimeline,
      amount: input.amount,
      currency: input.currency,
      stage: "discovery",
      version: 0,
      createdAt,
    };
    this.opportunities.set(opportunity.id, opportunity);
    this.auditEvents.push({ workspaceId: input.workspaceId, action: "opportunity.created", entityId: opportunity.id, actorId: input.ownerId, occurredAt: createdAt });
    return { opportunity: structuredClone(opportunity), deduplicated: false };
  }

  async qualifyOpportunity(input: QualifyOpportunityInput): Promise<OpportunityCreationResult & { delivery: ConversionDeliveryRecord }> {
    const opportunity = this.opportunities.get(input.opportunityId);
    if (!opportunity || opportunity.workspaceId !== input.workspaceId) throw new NotFoundException("Opportunity not found");
    const lead = this.leads.get(opportunity.primarySourceLeadId)!;
    if (!input.contactReachable || !input.relevantNeed || !input.targetBuyer || !input.nextAction.trim() || !opportunity.ownerId || lead.mergeReviewRequired) throw new BadRequestException("Complete the human qualification checks first");
    const existing = [...this.deliveries.values()].find(
      (delivery) =>
        delivery.workspaceId === input.workspaceId &&
        delivery.provider === lead.provider &&
        delivery.primarySourceLeadId === lead.id &&
        delivery.eventType === "LeadQualified",
    );
    if (existing) return { opportunity: structuredClone(opportunity), delivery: structuredClone(existing), deduplicated: true };
    const createdAt = new Date().toISOString();
    lead.status = "qualified";
    opportunity.qualifiedAt = createdAt;
    opportunity.nextAction = input.nextAction;
    opportunity.version += 1;

    const eventId = `qualified:${input.workspaceId}:${lead.id}:v1`;
    const hasAttribution = hasFeedbackAttribution(lead);
    const mode = loadConfig().adsMode;
    const shouldSkip = mode === "live" && (!isAdsProvider(lead.provider) || !hasAttribution || lead.isTest || lead.rawAttribution.consentStatus !== "granted");
    const delivery: ConversionDeliveryRecord = {
      id: `delivery_${randomUUID()}`,
      workspaceId: input.workspaceId,
      eventId,
      eventType: "LeadQualified",
      mode,
      provider: lead.provider,
      primarySourceLeadId: lead.id,
      opportunityId: opportunity.id,
      status: shouldSkip ? "skipped" : "pending",
      diagnosticStatus: "unknown",
      attemptCount: 0,
      skippedReason: shouldSkip ? (lead.isTest ? "test_record" : !hasAttribution ? "no_attribution" : "consent_required") : undefined,
      occurredAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    };
    this.deliveries.set(delivery.id, delivery);
    this.auditEvents.push({ workspaceId: input.workspaceId, action: "lead.qualified", entityId: lead.id, opportunityId: opportunity.id, actorId: input.actorId, occurredAt: createdAt, eventId });
    return { opportunity: structuredClone(opportunity), delivery: structuredClone(delivery), deduplicated: false };
  }

  async updateOpportunityStage(input: StageChangeInput): Promise<OpportunityRecord> {
    const item = this.opportunities.get(input.opportunityId);
    if (!item || item.workspaceId !== input.workspaceId) throw new NotFoundException("Opportunity not found");
    if (item.version !== input.expectedVersion) throw new ConflictException("Stage changed elsewhere. Refresh before retrying.");
    if (item.stage === input.stage) return structuredClone(item);
    const fromStage = item.stage;
    item.stage = input.stage;
    item.version += 1;
    this.auditEvents.push({ workspaceId: input.workspaceId, action: "opportunity.stage_changed", entityId: item.id, actorId: input.actorId, fromStage, toStage: item.stage, occurredAt: new Date().toISOString() });
    return structuredClone(item);
  }

  async saveInquiry(input: CreateInquiryInput & { workspaceId: string; leadId: string; deferAnalysis?: boolean }): Promise<InquiryRecord> {
    const prior = [...this.inquiries.values()].find((item) => item.workspaceId === input.workspaceId && item.eventId === input.eventId);
    if (prior) {
      if (prior.message !== input.message || prior.conversationId !== input.conversationId) throw new ConflictException("Event ID already belongs to different content");
      return structuredClone(prior);
    }
    const lead = this.leads.get(input.leadId);
    if (!lead || lead.workspaceId !== input.workspaceId) throw new NotFoundException("Lead not found");
    const { email: _email, deferAnalysis, ...safe } = input;
    const item: InquiryRecord = { ...safe, id: `inquiry_${randomUUID()}`, status: deferAnalysis ? "waiting_external" : "pending", attempts: 0, createdAt: new Date().toISOString() };
    lead.conversationId = input.conversationId;
    this.inquiries.set(item.id, item);
    return structuredClone(item);
  }

  async listInquiries(workspaceId: string): Promise<InquiryRecord[]> {
    return structuredClone([...this.inquiries.values()].filter((item) => item.workspaceId === workspaceId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async claimInquiry(): Promise<InquiryRecord | undefined> {
    const item = [...this.inquiries.values()].find((entry) => entry.status === "pending");
    if (!item) return;
    item.status = "processing";
    item.attempts += 1;
    return structuredClone(item);
  }

  async completeInquiry(workspaceId: string, id: string, result: { analysis?: QualificationAnalysis; provider: string; error?: string }): Promise<InquiryRecord> {
    const item = this.inquiries.get(id);
    if (!item || item.workspaceId !== workspaceId) throw new NotFoundException("Inquiry not found");
    if (item.status === "analyzed") return structuredClone(item);
    item.status = result.analysis ? "analyzed" : "failed";
    item.analysis = result.analysis;
    item.modelProvider = result.provider;
    item.error = result.error;
    const lead = this.leads.get(item.leadId)!;
    if (result.analysis) lead.aiQualification = structuredClone(result.analysis);
    return structuredClone(item);
  }

  async applyQualification(workspaceId: string, leadId: string, actorId: string, fields: QualificationFields, expectedRevision: number): Promise<LeadRecord> {
    const lead = this.leads.get(leadId);
    if (!lead || lead.workspaceId !== workspaceId) throw new NotFoundException("Lead not found");
    if ((lead.qualificationRevision || 0) !== expectedRevision) throw new ConflictException("Lead was edited elsewhere. Refresh before applying.");
    lead.confirmedQualification = structuredClone(fields);
    lead.qualificationRevision = expectedRevision + 1;
    this.auditEvents.push({ workspaceId, action: "lead.analysis_reviewed", entityId: leadId, actorId, revision: lead.qualificationRevision, occurredAt: new Date().toISOString() });
    return this.publicLead(lead);
  }

  async listOpportunities(workspaceId: string): Promise<OpportunityRecord[]> {
    return [...this.opportunities.values()]
      .filter((opportunity) => opportunity.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((value) => structuredClone(value));
  }

  async listPersons(workspaceId: string): Promise<PersonRecord[]> {
    const people = new Map<string, PersonRecord>();
    for (const lead of this.leads.values()) {
      if (lead.workspaceId !== workspaceId || !lead.personId || people.has(lead.personId)) continue;
      people.set(lead.personId, { id: lead.personId, workspaceId, companyId: lead.companyId, displayName: lead.displayName, emailMasked: lead.emailMasked, phoneMasked: lead.phoneMasked, createdAt: lead.createdAt });
    }
    return [...people.values()];
  }

  async listCompanies(workspaceId: string): Promise<CompanyRecord[]> {
    const companies = new Map<string, CompanyRecord>();
    for (const lead of this.leads.values()) {
      if (lead.workspaceId !== workspaceId || !lead.companyId || !lead.companyName || companies.has(lead.companyId)) continue;
      companies.set(lead.companyId, { id: lead.companyId, workspaceId, name: lead.companyName, country: lead.country, createdAt: lead.createdAt });
    }
    return [...companies.values()];
  }

  async listOrders(workspaceId: string): Promise<OrderMirrorRecord[]> {
    return [...this.orders.values()].filter((item) => item.workspaceId === workspaceId).map((item) => structuredClone(item));
  }

  async upsertOrderMirror(input: Omit<OrderMirrorRecord, "id" | "syncedAt">): Promise<OrderMirrorRecord> {
    const existing = [...this.orders.values()].find((item) => item.workspaceId === input.workspaceId && item.erpProvider === input.erpProvider && item.externalOrderId === input.externalOrderId);
    const order = { ...input, id: existing?.id || `order_${randomUUID()}`, syncedAt: new Date().toISOString() };
    this.orders.set(order.id, order);
    return structuredClone(order);
  }

  async listTasks(workspaceId: string): Promise<TaskRecord[]> {
    return [...this.tasks.values()].filter((item) => item.workspaceId === workspaceId).map((item) => structuredClone(item));
  }

  async createTask(input: CreateTaskInput): Promise<TaskRecord> {
    const task: TaskRecord = { ...input, id: `task_${randomUUID()}`, status: "open", createdAt: new Date().toISOString() };
    this.tasks.set(task.id, task);
    return structuredClone(task);
  }

  async listNotes(workspaceId: string): Promise<NoteRecord[]> {
    return [...this.notes.values()].filter((item) => item.workspaceId === workspaceId).map((item) => structuredClone(item));
  }

  async createNote(input: CreateNoteInput): Promise<NoteRecord> {
    const note: NoteRecord = { ...input, id: `note_${randomUUID()}`, createdAt: new Date().toISOString() };
    this.notes.set(note.id, note);
    return structuredClone(note);
  }

  async getRequirementContext(workspaceId: string, leadId: string, conversationId: string) {
    const lead = await this.getLeadInternal(workspaceId, leadId);
    if (!lead) return undefined;
    const key = `${workspaceId}:${leadId}:${conversationId}`;
    const state = this.requirementStates.get(key) || createInitialProjectState(lead.personId || lead.id, conversationId);
    return { lead, state: structuredClone(state) };
  }

  async getRequirementProfile(workspaceId: string, leadId: string, conversationId?: string) {
    if (conversationId) return structuredClone(this.requirementProfiles.get(`${workspaceId}:${leadId}:${conversationId}`));
    const profile = [...this.requirementProfiles.entries()].find(([key]) => key.startsWith(`${workspaceId}:${leadId}:`))?.[1];
    return profile ? structuredClone(profile) : undefined;
  }

  async getRequirementReceiptByEvent(workspaceId: string, eventId: string): Promise<RequirementCommitReceipt | undefined> {
    const receipt = this.requirementReceipts.get(`${workspaceId}:${eventId}`);
    if (!receipt) return undefined;
    return structuredClone({ ...receipt, status: "replayed" as const, readbackAt: new Date().toISOString() });
  }

  async commitRequirementTurn(input: RequirementCommitInput): Promise<RequirementCommitReceipt> {
    const existing = await this.getRequirementReceiptByEvent(input.workspaceId, input.eventId);
    if (existing) return existing;
    const key = `${input.workspaceId}:${input.leadId}:${input.conversationId}`;
    const current = this.requirementStates.get(key) || createInitialProjectState(input.nextState.contact_id, input.conversationId);
    if (input.nextState.revision !== current.revision + 1) throw new Error("Customer project revision conflict");
    const committedAt = new Date().toISOString();
    const knowledge = input.turnResult.knowledge_receipt;
    const sources = Array.isArray(knowledge?.results) ? knowledge.results.map((item: any) => ({
      title: String(item.title || ""),
      sourceUri: String(item.source_uri || ""),
      lineStart: Number(item.line_start || 0),
      lineEnd: Number(item.line_end || 0),
      contentHash: String(item.content_hash || ""),
    })) : [];
    const profile: RequirementProfileRecord = {
      leadId: input.leadId,
      conversationId: input.conversationId,
      revision: input.nextState.revision,
      fields: structuredClone(input.nextState.project.fields),
      conflicts: structuredClone(input.nextState.conflicts),
      latestTurn: {
        turnId: input.turnResult.turn_id,
        eventId: input.eventId,
        status: "committed",
        nextBestQuestion: structuredClone(input.turnResult.next_best_question),
        handoff: structuredClone(input.turnResult.handoff),
        answerBubbles: structuredClone(input.turnResult.answer?.bubbles || []),
        knowledge: knowledge ? {
          answerability: String(knowledge.answerability || "NO_APPROVED_EVIDENCE"),
          aggregateHash: String(knowledge.aggregate_hash || ""),
          retrievedAt: String(knowledge.retrieved_at || ""),
          sources,
        } : null,
        committedAt,
      },
    };
    this.requirementStates.set(key, structuredClone(input.nextState));
    this.requirementProfiles.set(key, profile);
    const receipt: RequirementCommitReceipt = {
      adapter: "memory",
      bundleId: input.turnResult.turn_id,
      idempotencyKey: input.turnResult.turn_id,
      status: "committed",
      leadId: input.leadId,
      eventId: input.eventId,
      customerProjectRevision: input.nextState.revision,
      interactionEventId: input.eventId,
      followupIntentId: String(input.turnResult.action_intent?.intent_id || ""),
      knowledgeAggregateHash: knowledge?.aggregate_hash || null,
      committedAt,
      readbackAt: committedAt,
      profile,
    };
    this.requirementReceipts.set(`${input.workspaceId}:${input.eventId}`, structuredClone(receipt));
    return receipt;
  }

  async listAudit(workspaceId: string): Promise<Array<Record<string, unknown>>> { return structuredClone(this.auditEvents.filter((event) => event.workspaceId === workspaceId)); }

  async listDeliveries(workspaceId: string): Promise<ConversionDeliveryRecord[]> {
    return [...this.deliveries.values()]
      .filter((delivery) => delivery.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((value) => structuredClone(value));
  }

  async getQualifiedContext(deliveryId: string): Promise<QualifiedContext | undefined> {
    const delivery = this.deliveries.get(deliveryId);
    if (!delivery) return undefined;
    const lead = this.leads.get(delivery.primarySourceLeadId);
    const opportunity = this.opportunities.get(delivery.opportunityId);
    if (!lead || !opportunity) return undefined;
    return {
      delivery: structuredClone(delivery),
      lead: structuredClone(lead),
      opportunity: structuredClone(opportunity),
      identifiers: structuredClone(lead.rawAttribution.identifiers),
    };
  }

  async claimPendingDeliveries(limit: number): Promise<ConversionDeliveryRecord[]> {
    const candidates = [...this.deliveries.values()]
      .filter(
        (delivery) =>
          delivery.status === "pending" ||
          (delivery.status === "retrying" && (!delivery.nextRetryAt || delivery.nextRetryAt <= new Date().toISOString())),
      )
      .slice(0, limit);
    for (const delivery of candidates) {
      delivery.status = "dispatching";
      delivery.updatedAt = new Date().toISOString();
    }
    return candidates.map((delivery) => structuredClone(delivery));
  }

  async updateDelivery(deliveryId: string, update: DeliveryUpdate): Promise<ConversionDeliveryRecord> {
    const delivery = this.deliveries.get(deliveryId);
    if (!delivery) throw new Error("Delivery not found");
    Object.assign(delivery, update, { updatedAt: new Date().toISOString() });
    return structuredClone(delivery);
  }

  async replayDelivery(workspaceId: string, deliveryId: string): Promise<ConversionDeliveryRecord> {
    const delivery = this.deliveries.get(deliveryId);
    if (!delivery || delivery.workspaceId !== workspaceId) throw new Error("Delivery not found");
    if (delivery.status === "skipped") throw new Error("Skipped delivery cannot be replayed");
    delivery.status = "pending";
    delivery.nextRetryAt = undefined;
    delivery.providerErrorCode = undefined;
    delivery.providerErrorMessage = undefined;
    delivery.updatedAt = new Date().toISOString();
    return structuredClone(delivery);
  }

  async getDashboard(workspaceId: string): Promise<DashboardSnapshot> {
    const leads = await this.listLeads(workspaceId);
    const opportunities = await this.listOpportunities(workspaceId);
    const deliveries = await this.listDeliveries(workspaceId);
    return {
      metrics: {
        totalLeads: leads.length,
        qualifiedLeads: leads.filter((lead) => lead.status === "qualified").length,
        opportunities: opportunities.length,
        acceptedDeliveries: deliveries.filter((delivery) => delivery.status === "accepted").length,
        failedDeliveries: deliveries.filter((delivery) => ["retrying", "dead_letter"].includes(delivery.status)).length,
      },
      leads,
      opportunities,
      deliveries,
    };
  }

  async close(): Promise<void> {}

  private publicLead(lead: InternalLead): LeadRecord {
    const { email: _email, phone: _phone, waId: _waId, rawAttribution: _raw, ...publicLead } = lead;
    return structuredClone(publicLead);
  }
}
