import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { Pool } from "pg";
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
} from "@ake/contracts";
import { FieldCipher, sha256 } from "../common/crypto";
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

function iso(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export class PostgresRevenueStore implements RevenueStore {
  private readonly pool: Pool;
  private readonly cipher: FieldCipher;

  constructor(databaseUrl: string, encryptionKey?: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 12 });
    this.cipher = new FieldCipher(encryptionKey);
  }

  async saveRawEvent(input: RawEventInput): Promise<void> {
    await this.ensureWorkspace(input.workspaceId);
    await this.pool.query(
      `INSERT INTO raw_events(id, workspace_id, provider, event_type, external_event_id, payload, payload_hash, received_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT DO NOTHING`,
      [`raw_${randomUUID()}`, input.workspaceId, input.provider, input.eventType, input.externalEventId, input.payload, input.payloadHash, input.receivedAt],
    );
  }

  async ingestLead(input: IngestLeadInput): Promise<LeadRecord> {
    await this.ensureWorkspace(input.workspaceId);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (input.externalLeadId) {
        const duplicate = await client.query<{ id: string }>(
          `SELECT id FROM leads WHERE workspace_id=$1 AND provider=$2 AND external_lead_id=$3`,
          [input.workspaceId, input.provider, input.externalLeadId],
        );
        if (duplicate.rowCount) {
          await client.query("COMMIT");
          const lead = await this.getLeadInternal(input.workspaceId, duplicate.rows[0].id);
          if (!lead) throw new Error("Duplicate lead could not be read");
          return this.publicLead(lead);
        }
      }

      const email = normalizeEmail(input.email);
      const phone = normalizePhone(input.phone);
      const matchIds = new Set<string>();
      if (email || phone) {
        const matches = await client.query<{ id: string }>(
          `SELECT id FROM people WHERE workspace_id=$1 AND
           (($2::text IS NOT NULL AND normalized_email=$2) OR ($3::text IS NOT NULL AND normalized_phone=$3))`,
          [input.workspaceId, email || null, phone || null],
        );
        matches.rows.forEach((row) => matchIds.add(row.id));
      }
      if (input.waId) {
        const matches = await client.query<{ person_id: string }>(
          `SELECT person_id FROM channel_identities WHERE workspace_id=$1 AND provider='whatsapp' AND external_user_id=$2`,
          [input.workspaceId, input.waId],
        );
        matches.rows.forEach((row) => matchIds.add(row.person_id));
      }

      let personId: string;
      let companyId: string | undefined;
      if (matchIds.size === 1) {
        personId = [...matchIds][0];
        const person = await client.query<{ company_id: string | null }>(`SELECT company_id FROM people WHERE id=$1`, [personId]);
        companyId = person.rows[0]?.company_id || undefined;
      } else {
        if (input.companyName) {
          companyId = `company_${randomUUID()}`;
          await client.query(`INSERT INTO companies(id,workspace_id,name,country) VALUES ($1,$2,$3,$4)`, [
            companyId,
            input.workspaceId,
            input.companyName,
            input.country || null,
          ]);
        }
        personId = `person_${randomUUID()}`;
        await client.query(
          `INSERT INTO people(id,workspace_id,company_id,display_name,normalized_email,normalized_phone,email_hash,phone_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [personId, input.workspaceId, companyId || null, input.displayName, email || null, phone || null, email ? sha256(email) : null, phone ? sha256(phone) : null],
        );
      }
      if (input.waId) {
        await client.query(
          `INSERT INTO channel_identities(id,workspace_id,person_id,provider,external_user_id,verified_at)
           VALUES ($1,$2,$3,'whatsapp',$4,now()) ON CONFLICT DO NOTHING`,
          [`identity_${randomUUID()}`, input.workspaceId, personId, input.waId],
        );
      }

      const leadId = `lead_${randomUUID()}`;
      await client.query(
        `INSERT INTO leads(id,workspace_id,person_id,company_id,provider,source_kind,external_lead_id,display_name,country,merge_review_required,is_test)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [leadId, input.workspaceId, personId, companyId || null, input.provider, input.sourceKind, input.externalLeadId || null, input.displayName, input.country || null, matchIds.size > 1, input.isTest],
      );
      const touchId = `touch_${randomUUID()}`;
      await client.query(
        `INSERT INTO attribution_touches(id,workspace_id,lead_id,provider,source_kind,occurred_at,landing_url,referrer,utm,consent_status,metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [touchId, input.workspaceId, leadId, input.provider, input.sourceKind, input.attribution.occurredAt, input.attribution.landingUrl || null, input.attribution.referrer || null, input.attribution.utm || {}, input.attribution.consentStatus || "unknown", input.attribution.metadata || {}],
      );
      for (const identifier of input.attribution.identifiers) {
        await client.query(
          `INSERT INTO ad_identifiers(id,workspace_id,attribution_touch_id,identifier_type,value_ciphertext,value_hash,preview)
           VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
          [`identifier_${randomUUID()}`, input.workspaceId, touchId, identifier.type, this.cipher.encrypt(identifier.value), sha256(identifier.value), identifierPreview(identifier.value)],
        );
      }
      await this.audit(client, input.workspaceId, "system:ingestion", "lead.created", "lead", leadId, null, { provider: input.provider, sourceKind: input.sourceKind });
      await client.query("COMMIT");
      const lead = await this.getLeadInternal(input.workspaceId, leadId);
      if (!lead) throw new Error("Lead could not be read after insert");
      return this.publicLead(lead);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listLeads(workspaceId: string): Promise<LeadRecord[]> {
    const rows = await this.pool.query<{ id: string }>(`SELECT id FROM leads WHERE workspace_id=$1 ORDER BY created_at DESC`, [workspaceId]);
    const results = await Promise.all(rows.rows.map((row) => this.getLeadInternal(workspaceId, row.id)));
    return results.filter((lead): lead is InternalLead => Boolean(lead)).map((lead) => this.publicLead(lead));
  }

  async getLeadInternal(workspaceId: string, leadId: string): Promise<InternalLead | undefined> {
    const result = await this.pool.query(
      `SELECT l.*, p.normalized_email, p.normalized_phone, c.name AS company_name,
              t.id AS touch_id, t.occurred_at AS touch_occurred_at, t.landing_url, t.referrer, t.utm,
              t.consent_status, t.metadata
       FROM leads l
       LEFT JOIN people p ON p.id=l.person_id
       LEFT JOIN companies c ON c.id=l.company_id
       JOIN attribution_touches t ON t.lead_id=l.id
       WHERE l.workspace_id=$1 AND l.id=$2
       ORDER BY t.occurred_at ASC LIMIT 1`,
      [workspaceId, leadId],
    );
    if (!result.rowCount) return undefined;
    const row = result.rows[0];
    const ids = await this.pool.query(
      `SELECT identifier_type,value_ciphertext,preview FROM ad_identifiers WHERE attribution_touch_id=$1 ORDER BY created_at`,
      [row.touch_id],
    );
    const rawIdentifiers = ids.rows.map((item) => ({ type: item.identifier_type, value: this.cipher.decrypt(item.value_ciphertext) }));
    const campaignId = rawIdentifiers.find((item) => item.type === "campaign_id")?.value;
    const formId = rawIdentifiers.find((item) => item.type === "form_id")?.value;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      personId: row.person_id || undefined,
      companyId: row.company_id || undefined,
      provider: row.provider,
      sourceKind: row.source_kind,
      externalLeadId: row.external_lead_id || undefined,
      displayName: row.display_name,
      email: row.normalized_email || undefined,
      phone: row.normalized_phone || undefined,
      emailMasked: maskEmail(row.normalized_email),
      phoneMasked: maskPhone(row.normalized_phone),
      companyName: row.company_name || undefined,
      country: row.country || undefined,
      status: row.status,
      mergeReviewRequired: row.merge_review_required,
      isTest: row.is_test,
      createdAt: iso(row.created_at)!,
      rawAttribution: {
        provider: row.provider,
        sourceKind: row.source_kind,
        occurredAt: iso(row.touch_occurred_at)!,
        landingUrl: row.landing_url || undefined,
        referrer: row.referrer || undefined,
        utm: row.utm || undefined,
        consentStatus: row.consent_status,
        metadata: row.metadata || undefined,
        identifiers: rawIdentifiers as InternalLead["rawAttribution"]["identifiers"],
      },
      attribution: {
        id: row.touch_id,
        provider: row.provider,
        sourceKind: row.source_kind,
        occurredAt: iso(row.touch_occurred_at)!,
        identifiers: ids.rows.map((item) => ({ type: item.identifier_type, preview: item.preview })),
        campaignId,
        formId,
      },
    };
  }

  async createOpportunity(input: CreateOpportunityInput): Promise<OpportunityCreationResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const leadResult = await client.query(
        `SELECT * FROM leads WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,
        [input.workspaceId, input.primarySourceLeadId],
      );
      if (!leadResult.rowCount) throw new Error("Primary source lead not found");
      const leadRow = leadResult.rows[0];
      if (input.personId && input.personId !== leadRow.person_id) throw new Error("Lead does not belong to person");
      if (input.companyId && input.companyId !== leadRow.company_id) throw new Error("Lead does not belong to company");

      const opportunityId = `opp_${randomUUID()}`;
      const createdAt = new Date().toISOString();
      await client.query(
        `INSERT INTO opportunities(id,workspace_id,person_id,company_id,primary_source_lead_id,name,direction,country,owner_id,next_action,expected_timeline,amount,currency)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [opportunityId, input.workspaceId, input.personId || null, input.companyId || null, input.primarySourceLeadId, input.name, input.direction, input.country, input.ownerId, input.nextAction || null, input.expectedTimeline || null, input.amount ?? null, input.currency],
      );
      await client.query(`UPDATE leads SET status='qualified' WHERE id=$1`, [input.primarySourceLeadId]);
      await client.query(
        `INSERT INTO opportunity_stage_history(id,workspace_id,opportunity_id,to_stage,actor_id,occurred_at)
         VALUES ($1,$2,$3,'discovery',$4,$5)`,
        [`history_${randomUUID()}`, input.workspaceId, opportunityId, input.ownerId, createdAt],
      );

      const existing = await client.query(
        `SELECT * FROM conversion_deliveries WHERE workspace_id=$1 AND provider=$2 AND primary_source_lead_id=$3 AND event_type='LeadQualified'`,
        [input.workspaceId, leadRow.provider, input.primarySourceLeadId],
      );
      const opportunity = this.mapOpportunity({ ...input, id: opportunityId, stage: "discovery", created_at: createdAt });
      if (existing.rowCount) {
        await this.audit(client, input.workspaceId, input.ownerId, "opportunity.created.qualified_deduplicated", "opportunity", opportunityId, null, { sourceLeadId: input.primarySourceLeadId });
        await client.query("COMMIT");
        return { opportunity, delivery: this.mapDelivery(existing.rows[0]), deduplicated: true };
      }

      const touch = await client.query(`SELECT * FROM attribution_touches WHERE lead_id=$1 ORDER BY occurred_at ASC LIMIT 1`, [input.primarySourceLeadId]);
      const ids = touch.rowCount
        ? await client.query(`SELECT identifier_type,preview FROM ad_identifiers WHERE attribution_touch_id=$1`, [touch.rows[0].id])
        : { rows: [] };
      const leadContext = await this.getLeadInternal(input.workspaceId, input.primarySourceLeadId);
      const shouldSkip = !isAdsProvider(leadRow.provider) || !leadContext || !hasFeedbackAttribution(leadContext);
      const eventKey = `qualified:${input.workspaceId}:${input.primarySourceLeadId}:v1`;
      const eventDbId = `event_${randomUUID()}`;
      const snapshot = {
        provider: leadRow.provider,
        sourceKind: leadRow.source_kind,
        touchId: touch.rows[0]?.id,
        identifiers: ids.rows,
      };
      await client.query(
        `INSERT INTO conversion_events(id,workspace_id,event_key,event_type,primary_source_lead_id,opportunity_id,attribution_snapshot,occurred_at)
         VALUES ($1,$2,$3,'LeadQualified',$4,$5,$6,$7)`,
        [eventDbId, input.workspaceId, eventKey, input.primarySourceLeadId, opportunityId, snapshot, createdAt],
      );
      const deliveryId = `delivery_${randomUUID()}`;
      const status = shouldSkip ? "skipped" : "pending";
      await client.query(
        `INSERT INTO conversion_deliveries(id,workspace_id,conversion_event_id,event_key,event_type,provider,primary_source_lead_id,opportunity_id,status,skipped_reason,occurred_at)
         VALUES ($1,$2,$3,$4,'LeadQualified',$5,$6,$7,$8,$9,$10)`,
        [deliveryId, input.workspaceId, eventDbId, eventKey, leadRow.provider, input.primarySourceLeadId, opportunityId, status, shouldSkip ? "no_attribution" : null, createdAt],
      );
      await this.audit(client, input.workspaceId, input.ownerId, "opportunity.created.qualified", "opportunity", opportunityId, null, { sourceLeadId: input.primarySourceLeadId, deliveryId });
      await client.query("COMMIT");
      const deliveryResult = await this.pool.query(`SELECT * FROM conversion_deliveries WHERE id=$1`, [deliveryId]);
      return { opportunity, delivery: this.mapDelivery(deliveryResult.rows[0]), deduplicated: false };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listOpportunities(workspaceId: string): Promise<OpportunityRecord[]> {
    const result = await this.pool.query(`SELECT * FROM opportunities WHERE workspace_id=$1 ORDER BY created_at DESC`, [workspaceId]);
    return result.rows.map((row) => this.mapOpportunity(row));
  }

  async listPersons(workspaceId: string): Promise<PersonRecord[]> {
    const result = await this.pool.query(`SELECT * FROM people WHERE workspace_id=$1 ORDER BY created_at DESC`, [workspaceId]);
    return result.rows.map((row) => ({ id: row.id, workspaceId: row.workspace_id, companyId: row.company_id || undefined, displayName: row.display_name, emailMasked: maskEmail(row.normalized_email), phoneMasked: maskPhone(row.normalized_phone), createdAt: iso(row.created_at)! }));
  }

  async listCompanies(workspaceId: string): Promise<CompanyRecord[]> {
    const result = await this.pool.query(`SELECT * FROM companies WHERE workspace_id=$1 ORDER BY created_at DESC`, [workspaceId]);
    return result.rows.map((row) => ({ id: row.id, workspaceId: row.workspace_id, name: row.name, country: row.country || undefined, createdAt: iso(row.created_at)! }));
  }

  async listOrders(workspaceId: string): Promise<OrderMirrorRecord[]> {
    const result = await this.pool.query(`SELECT * FROM order_mirrors WHERE workspace_id=$1 ORDER BY synced_at DESC`, [workspaceId]);
    return result.rows.map((row) => this.mapOrder(row));
  }

  async upsertOrderMirror(input: Omit<OrderMirrorRecord, "id" | "syncedAt">): Promise<OrderMirrorRecord> {
    await this.ensureWorkspace(input.workspaceId);
    const result = await this.pool.query(
      `INSERT INTO order_mirrors(id,workspace_id,opportunity_id,erp_provider,external_order_id,status,amount,currency,synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
       ON CONFLICT (workspace_id,erp_provider,external_order_id) DO UPDATE SET opportunity_id=excluded.opportunity_id,status=excluded.status,amount=excluded.amount,currency=excluded.currency,synced_at=now()
       RETURNING *`,
      [`order_${randomUUID()}`, input.workspaceId, input.opportunityId || null, input.erpProvider, input.externalOrderId, input.status, input.amount ?? null, input.currency || null],
    );
    return this.mapOrder(result.rows[0]);
  }

  async listTasks(workspaceId: string): Promise<TaskRecord[]> {
    const result = await this.pool.query(`SELECT * FROM crm_tasks WHERE workspace_id=$1 ORDER BY created_at DESC`, [workspaceId]);
    return result.rows.map((row) => ({ id: row.id, workspaceId: row.workspace_id, leadId: row.lead_id || undefined, opportunityId: row.opportunity_id || undefined, title: row.title, ownerId: row.owner_id, status: row.status, dueAt: iso(row.due_at), createdAt: iso(row.created_at)! }));
  }

  async createTask(input: CreateTaskInput): Promise<TaskRecord> {
    await this.ensureWorkspace(input.workspaceId);
    const result = await this.pool.query(`INSERT INTO crm_tasks(id,workspace_id,lead_id,opportunity_id,title,owner_id,due_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [`task_${randomUUID()}`, input.workspaceId, input.leadId || null, input.opportunityId || null, input.title, input.ownerId, input.dueAt || null]);
    const row = result.rows[0];
    return { id: row.id, workspaceId: row.workspace_id, leadId: row.lead_id || undefined, opportunityId: row.opportunity_id || undefined, title: row.title, ownerId: row.owner_id, status: row.status, dueAt: iso(row.due_at), createdAt: iso(row.created_at)! };
  }

  async listNotes(workspaceId: string): Promise<NoteRecord[]> {
    const result = await this.pool.query(`SELECT * FROM crm_notes WHERE workspace_id=$1 ORDER BY created_at DESC`, [workspaceId]);
    return result.rows.map((row) => ({ id: row.id, workspaceId: row.workspace_id, leadId: row.lead_id || undefined, opportunityId: row.opportunity_id || undefined, authorId: row.author_id, body: row.body, createdAt: iso(row.created_at)! }));
  }

  async createNote(input: CreateNoteInput): Promise<NoteRecord> {
    await this.ensureWorkspace(input.workspaceId);
    const result = await this.pool.query(`INSERT INTO crm_notes(id,workspace_id,lead_id,opportunity_id,author_id,body) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [`note_${randomUUID()}`, input.workspaceId, input.leadId || null, input.opportunityId || null, input.authorId, input.body]);
    const row = result.rows[0];
    return { id: row.id, workspaceId: row.workspace_id, leadId: row.lead_id || undefined, opportunityId: row.opportunity_id || undefined, authorId: row.author_id, body: row.body, createdAt: iso(row.created_at)! };
  }

  async getRequirementContext(workspaceId: string, leadId: string, conversationId: string) {
    const lead = await this.getLeadInternal(workspaceId, leadId);
    if (!lead) return undefined;
    const result = await this.pool.query<{ state: CustomerProjectState }>(
      `SELECT state FROM customer_project_states WHERE workspace_id=$1 AND lead_id=$2 AND conversation_id=$3`,
      [workspaceId, leadId, conversationId],
    );
    return { lead, state: result.rows[0]?.state || createInitialProjectState(lead.personId || lead.id, conversationId) };
  }

  async getRequirementProfile(workspaceId: string, leadId: string, conversationId?: string): Promise<RequirementProfileRecord | undefined> {
    const params = conversationId ? [workspaceId, leadId, conversationId] : [workspaceId, leadId];
    const condition = conversationId ? "AND s.conversation_id=$3" : "";
    const result = await this.pool.query(
      `SELECT s.state,s.revision,s.conversation_id,
              t.turn_id,t.event_id,t.next_best_question,t.handoff,t.answer_bubbles,t.knowledge_receipt,t.committed_at
       FROM customer_project_states s
       LEFT JOIN LATERAL (
         SELECT * FROM requirement_turns rt
         WHERE rt.workspace_id=s.workspace_id AND rt.lead_id=s.lead_id AND rt.conversation_id=s.conversation_id
         ORDER BY rt.committed_at DESC LIMIT 1
       ) t ON true
       WHERE s.workspace_id=$1 AND s.lead_id=$2 ${condition}
       ORDER BY s.updated_at DESC LIMIT 1`,
      params,
    );
    if (!result.rowCount) return undefined;
    const row = result.rows[0];
    return this.mapRequirementProfile(leadId, row);
  }

  async getRequirementReceiptByEvent(workspaceId: string, eventId: string): Promise<RequirementCommitReceipt | undefined> {
    const result = await this.pool.query(
      `SELECT turn_id,lead_id,conversation_id,event_id,interaction_event_id,followup_intent_id,
              project_revision,knowledge_aggregate_hash,committed_at
       FROM requirement_turns WHERE workspace_id=$1 AND event_id=$2`,
      [workspaceId, eventId],
    );
    if (!result.rowCount) return undefined;
    const row = result.rows[0];
    const profile = await this.getRequirementProfile(workspaceId, row.lead_id, row.conversation_id);
    if (!profile) throw new Error("Requirement replay receipt exists without readback state");
    return this.mapRequirementReceipt(row, profile, "replayed");
  }

  async commitRequirementTurn(input: RequirementCommitInput): Promise<RequirementCommitReceipt> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const replay = await client.query(
        `SELECT turn_id,lead_id,conversation_id,event_id,interaction_event_id,followup_intent_id,
                project_revision,knowledge_aggregate_hash,committed_at
         FROM requirement_turns WHERE workspace_id=$1 AND event_id=$2 FOR UPDATE`,
        [input.workspaceId, input.eventId],
      );
      if (replay.rowCount) {
        await client.query("COMMIT");
        const profile = await this.getRequirementProfile(input.workspaceId, input.leadId, input.conversationId);
        if (!profile) throw new Error("Requirement replay readback failed");
        return this.mapRequirementReceipt(replay.rows[0], profile, "replayed");
      }

      const current = await client.query<{ revision: number; state: CustomerProjectState }>(
        `SELECT revision,state FROM customer_project_states
         WHERE workspace_id=$1 AND lead_id=$2 AND conversation_id=$3 FOR UPDATE`,
        [input.workspaceId, input.leadId, input.conversationId],
      );
      const currentRevision = current.rows[0]?.revision ?? 0;
      if (input.nextState.revision !== currentRevision + 1) throw new Error("Customer project revision conflict");

      const knowledge = input.turnResult.knowledge_receipt || null;
      const turnId = String(input.turnResult.turn_id);
      const followupIntentId = String(input.turnResult.action_intent?.intent_id || `${turnId}:followup`);
      const interactionId = `interaction_${randomUUID()}`;
      const stateWrite = await client.query(
        `INSERT INTO customer_project_states(workspace_id,lead_id,conversation_id,contact_id,revision,state,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,now())
         ON CONFLICT(workspace_id,lead_id,conversation_id) DO UPDATE
           SET contact_id=excluded.contact_id,revision=excluded.revision,state=excluded.state,updated_at=now()
         WHERE customer_project_states.revision=$7
         RETURNING revision`,
        [input.workspaceId, input.leadId, input.conversationId, input.nextState.contact_id, input.nextState.revision, JSON.stringify(input.nextState), currentRevision],
      );
      if (!stateWrite.rowCount) throw new Error("Customer project revision conflict");
      await client.query(
        `INSERT INTO requirement_interactions(id,workspace_id,lead_id,conversation_id,event_id,direction,channel,occurred_at,message_ciphertext,message_hash,turn_id)
         VALUES($1,$2,$3,$4,$5,'inbound',$6,$7,$8,$9,$10)`,
        [interactionId, input.workspaceId, input.leadId, input.conversationId, input.eventId, input.turnResult.action_intent?.channel || "whatsapp", input.occurredAt, this.cipher.encrypt(input.message), sha256(input.message), turnId],
      );
      await client.query(
        `INSERT INTO requirement_followups(id,workspace_id,lead_id,conversation_id,intent_id,status,channel,current_objective,next_question,draft_bubbles,knowledge_aggregate_hash,updated_at)
         VALUES($1,$2,$3,$4,$5,'draft_only',$6,$7,$8,$9,$10,now())
         ON CONFLICT(workspace_id,intent_id) DO UPDATE SET current_objective=excluded.current_objective,next_question=excluded.next_question,draft_bubbles=excluded.draft_bubbles,knowledge_aggregate_hash=excluded.knowledge_aggregate_hash,updated_at=now()`,
        [`followup_${randomUUID()}`, input.workspaceId, input.leadId, input.conversationId, followupIntentId, input.turnResult.action_intent?.channel || "whatsapp", input.nextState.discovery.current_objective, input.turnResult.next_best_question?.question || null, JSON.stringify(input.turnResult.answer?.bubbles || []), knowledge?.aggregate_hash || null],
      );
      const inserted = await client.query(
        `INSERT INTO requirement_turns(turn_id,workspace_id,lead_id,conversation_id,event_id,interaction_event_id,followup_intent_id,project_revision,turn_result,next_best_question,handoff,answer_bubbles,knowledge_receipt,knowledge_aggregate_hash,actor_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING turn_id,lead_id,conversation_id,event_id,interaction_event_id,followup_intent_id,project_revision,knowledge_aggregate_hash,committed_at`,
        [
          turnId,
          input.workspaceId,
          input.leadId,
          input.conversationId,
          input.eventId,
          input.eventId,
          followupIntentId,
          input.nextState.revision,
          JSON.stringify(input.turnResult),
          input.turnResult.next_best_question ? JSON.stringify(input.turnResult.next_best_question) : null,
          JSON.stringify(input.turnResult.handoff),
          JSON.stringify(input.turnResult.answer?.bubbles || []),
          knowledge ? JSON.stringify(knowledge) : null,
          knowledge?.aggregate_hash || null,
          input.actorId,
        ],
      );
      await this.audit(client, input.workspaceId, input.actorId, "requirement.turn.committed", "lead", input.leadId, { revision: currentRevision }, { revision: input.nextState.revision, eventId: input.eventId, knowledgeAggregateHash: knowledge?.aggregate_hash || null });
      await client.query("COMMIT");
      const profile = await this.getRequirementProfile(input.workspaceId, input.leadId, input.conversationId);
      if (!profile) throw new Error("Requirement commit readback failed");
      return this.mapRequirementReceipt(inserted.rows[0], profile, "committed");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listAudit(workspaceId: string): Promise<Array<Record<string, unknown>>> {
    const result = await this.pool.query(`SELECT id,actor_id,action,entity_type,entity_id,occurred_at FROM audit_log WHERE workspace_id=$1 ORDER BY occurred_at DESC LIMIT 200`, [workspaceId]);
    return result.rows.map((row) => ({ id: row.id, actorId: row.actor_id, action: row.action, entityType: row.entity_type, entityId: row.entity_id, occurredAt: iso(row.occurred_at) }));
  }

  async listDeliveries(workspaceId: string): Promise<ConversionDeliveryRecord[]> {
    const result = await this.pool.query(`SELECT * FROM conversion_deliveries WHERE workspace_id=$1 ORDER BY created_at DESC`, [workspaceId]);
    return result.rows.map((row) => this.mapDelivery(row));
  }

  async getQualifiedContext(deliveryId: string): Promise<QualifiedContext | undefined> {
    const deliveryResult = await this.pool.query(`SELECT * FROM conversion_deliveries WHERE id=$1`, [deliveryId]);
    if (!deliveryResult.rowCount) return undefined;
    const delivery = this.mapDelivery(deliveryResult.rows[0]);
    const lead = await this.getLeadInternal(delivery.workspaceId, delivery.primarySourceLeadId);
    const opportunityResult = await this.pool.query(`SELECT * FROM opportunities WHERE id=$1`, [delivery.opportunityId]);
    if (!lead || !opportunityResult.rowCount) return undefined;
    return {
      delivery,
      lead,
      opportunity: this.mapOpportunity(opportunityResult.rows[0]),
      identifiers: lead.rawAttribution.identifiers,
    };
  }

  async claimPendingDeliveries(limit: number): Promise<ConversionDeliveryRecord[]> {
    const result = await this.pool.query(
      `WITH candidates AS (
         SELECT id FROM conversion_deliveries
         WHERE status='pending' OR (status='retrying' AND (next_retry_at IS NULL OR next_retry_at<=now()))
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $1
       )
       UPDATE conversion_deliveries d SET status='dispatching',updated_at=now()
       FROM candidates c WHERE d.id=c.id RETURNING d.*`,
      [limit],
    );
    return result.rows.map((row) => this.mapDelivery(row));
  }

  async updateDelivery(deliveryId: string, update: DeliveryUpdate): Promise<ConversionDeliveryRecord> {
    const current = await this.pool.query(`SELECT * FROM conversion_deliveries WHERE id=$1`, [deliveryId]);
    if (!current.rowCount) throw new Error("Delivery not found");
    const next = { ...this.mapDelivery(current.rows[0]), ...update };
    const result = await this.pool.query(
      `UPDATE conversion_deliveries SET status=$2,diagnostic_status=$3,attempt_count=$4,next_retry_at=$5,
       provider_response_id=$6,provider_error_code=$7,provider_error_message=$8,payload_preview=$9,updated_at=now()
       WHERE id=$1 RETURNING *`,
      [deliveryId, next.status, next.diagnosticStatus, next.attemptCount, next.nextRetryAt || null, next.providerResponseId || null, next.providerErrorCode || null, next.providerErrorMessage || null, next.payloadPreview || null],
    );
    return this.mapDelivery(result.rows[0]);
  }

  async replayDelivery(workspaceId: string, deliveryId: string): Promise<ConversionDeliveryRecord> {
    const result = await this.pool.query(
      `UPDATE conversion_deliveries SET status='pending',next_retry_at=NULL,provider_error_code=NULL,provider_error_message=NULL,updated_at=now()
       WHERE workspace_id=$1 AND id=$2 AND status<>'skipped' RETURNING *`,
      [workspaceId, deliveryId],
    );
    if (!result.rowCount) throw new Error("Delivery not found or cannot be replayed");
    return this.mapDelivery(result.rows[0]);
  }

  async getDashboard(workspaceId: string): Promise<DashboardSnapshot> {
    const [leads, opportunities, deliveries] = await Promise.all([
      this.listLeads(workspaceId),
      this.listOpportunities(workspaceId),
      this.listDeliveries(workspaceId),
    ]);
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

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async ensureWorkspace(workspaceId: string) {
    await this.pool.query(`INSERT INTO workspaces(id,name) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [workspaceId, workspaceId]);
  }

  private async audit(client: PoolClient, workspaceId: string, actorId: string, action: string, entityType: string, entityId: string, before: unknown, after: unknown) {
    await client.query(
      `INSERT INTO audit_log(id,workspace_id,actor_id,action,entity_type,entity_id,before_state,after_state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [`audit_${randomUUID()}`, workspaceId, actorId, action, entityType, entityId, before, after],
    );
  }

  private publicLead(lead: InternalLead): LeadRecord {
    const { email: _email, phone: _phone, waId: _waId, rawAttribution: _raw, ...publicLead } = lead;
    return publicLead;
  }

  private mapOpportunity(row: QueryResultRow): OpportunityRecord {
    return {
      id: row.id,
      workspaceId: row.workspace_id || row.workspaceId,
      personId: row.person_id || row.personId || undefined,
      companyId: row.company_id || row.companyId || undefined,
      primarySourceLeadId: row.primary_source_lead_id || row.primarySourceLeadId,
      name: row.name,
      direction: row.direction,
      country: row.country,
      ownerId: row.owner_id || row.ownerId,
      nextAction: row.next_action || row.nextAction || undefined,
      expectedTimeline: row.expected_timeline || row.expectedTimeline || undefined,
      amount: row.amount === null || row.amount === undefined ? undefined : Number(row.amount),
      currency: row.currency,
      stage: row.stage,
      createdAt: iso(row.created_at || row.createdAt)!,
    };
  }

  private mapDelivery(row: QueryResultRow): ConversionDeliveryRecord {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      eventId: row.event_key,
      eventType: row.event_type,
      provider: row.provider,
      primarySourceLeadId: row.primary_source_lead_id,
      opportunityId: row.opportunity_id,
      status: row.status,
      diagnosticStatus: row.diagnostic_status,
      attemptCount: row.attempt_count,
      nextRetryAt: iso(row.next_retry_at),
      providerResponseId: row.provider_response_id || undefined,
      providerErrorCode: row.provider_error_code || undefined,
      providerErrorMessage: row.provider_error_message || undefined,
      skippedReason: row.skipped_reason || undefined,
      payloadPreview: row.payload_preview || undefined,
      occurredAt: iso(row.occurred_at)!,
      createdAt: iso(row.created_at)!,
      updatedAt: iso(row.updated_at)!,
    };
  }

  private mapOrder(row: QueryResultRow): OrderMirrorRecord {
    return { id: row.id, workspaceId: row.workspace_id, opportunityId: row.opportunity_id || undefined, erpProvider: row.erp_provider, externalOrderId: row.external_order_id, status: row.status, amount: row.amount === null || row.amount === undefined ? undefined : Number(row.amount), currency: row.currency || undefined, syncedAt: iso(row.synced_at)! };
  }

  private mapRequirementProfile(leadId: string, row: QueryResultRow): RequirementProfileRecord {
    const knowledge = row.knowledge_receipt;
    const sources = Array.isArray(knowledge?.results) ? knowledge.results.map((item: any) => ({
      title: String(item.title || ""),
      sourceUri: String(item.source_uri || ""),
      lineStart: Number(item.line_start || 0),
      lineEnd: Number(item.line_end || 0),
      contentHash: String(item.content_hash || ""),
    })) : [];
    return {
      leadId,
      conversationId: row.conversation_id,
      revision: Number(row.revision),
      fields: row.state?.project?.fields || {},
      conflicts: row.state?.conflicts || [],
      ...(row.turn_id ? { latestTurn: {
        turnId: row.turn_id,
        eventId: row.event_id,
        status: "committed" as const,
        nextBestQuestion: row.next_best_question || null,
        handoff: row.handoff || {},
        answerBubbles: row.answer_bubbles || [],
        knowledge: knowledge ? {
          answerability: String(knowledge.answerability || "NO_APPROVED_EVIDENCE"),
          aggregateHash: String(knowledge.aggregate_hash || ""),
          retrievedAt: String(knowledge.retrieved_at || ""),
          sources,
        } : null,
        committedAt: iso(row.committed_at)!,
      } } : {}),
    };
  }

  private mapRequirementReceipt(row: QueryResultRow, profile: RequirementProfileRecord, status: "committed" | "replayed"): RequirementCommitReceipt {
    const readbackAt = new Date().toISOString();
    return {
      adapter: "postgres",
      bundleId: row.turn_id,
      idempotencyKey: row.turn_id,
      status,
      leadId: row.lead_id,
      eventId: row.event_id,
      customerProjectRevision: Number(row.project_revision),
      interactionEventId: row.interaction_event_id,
      followupIntentId: row.followup_intent_id,
      knowledgeAggregateHash: row.knowledge_aggregate_hash || null,
      committedAt: iso(row.committed_at)!,
      readbackAt,
      profile,
    };
  }
}
