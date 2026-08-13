import { BadRequestException, Body, Controller, Get, Headers, Post, Query, Req } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import type { AdIdentifierInput, IngestLeadInput, Provider } from "@ake/contracts";
import { loadConfig } from "../config";
import { requestWorkspace } from "../common/http";
import { IngestionService } from "./ingestion.service";

interface GoogleColumn { column_id?: string; column_name?: string; string_value?: string }
interface GoogleLeadPayload {
  lead_id?: string;
  user_column_data?: GoogleColumn[];
  form_id?: string | number;
  campaign_id?: string | number;
  adgroup_id?: string | number;
  creative_id?: string | number;
  asset_group_id?: string | number;
  gcl_id?: string;
  google_key?: string;
  is_test?: boolean;
  lead_submit_time?: string;
}

@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly ingestion: IngestionService) {}

  @Post("google/leadform/:connectorId")
  async google(@Body() body: GoogleLeadPayload, @Req() request: Request) {
    const config = loadConfig();
    if (config.google.webhookKey && body.google_key !== config.google.webhookKey) {
      throw new BadRequestException("Invalid google_key");
    }
    if (!body.lead_id) throw new BadRequestException("lead_id is required");
    const columns = new Map((body.user_column_data || []).map((item) => [item.column_id, item.string_value]));
    const identifiers = this.compactIdentifiers([
      ["google_lead_id", body.lead_id],
      ["google_gcl_id", body.gcl_id],
      ["form_id", body.form_id],
      ["campaign_id", body.campaign_id],
      ["ad_group_id", body.adgroup_id],
      ["creative_id", body.creative_id],
      ["asset_group_id", body.asset_group_id],
    ]);
    const input: IngestLeadInput = {
      workspaceId: requestWorkspace(request),
      provider: "google",
      sourceKind: "instant_form",
      externalLeadId: body.lead_id,
      displayName: columns.get("FULL_NAME") || columns.get("FIRST_NAME") || `Google lead ${body.lead_id.slice(-6)}`,
      email: columns.get("EMAIL"),
      phone: columns.get("PHONE_NUMBER"),
      country: columns.get("COUNTRY"),
      isTest: Boolean(body.is_test),
      attribution: {
        provider: "google",
        sourceKind: "instant_form",
        occurredAt: body.lead_submit_time || new Date().toISOString(),
        identifiers,
        consentStatus: "unknown",
        metadata: { schema: "google-lead-form-webhook" },
      },
    };
    return this.ingestion.ingest(input, body, "google_lead_form");
  }

  @Get("meta/leadgen")
  metaVerify(
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") token: string,
    @Query("hub.challenge") challenge: string,
  ) {
    const config = loadConfig();
    if (mode !== "subscribe" || !config.meta.verifyToken || token !== config.meta.verifyToken) {
      throw new BadRequestException("Meta verification failed");
    }
    return challenge;
  }

  @Post("meta/leadgen")
  async meta(@Body() body: any, @Headers("x-hub-signature-256") signature: string | undefined, @Req() request: Request) {
    this.verifyMetaSignature(request, signature);
    const values = (body.entry || []).flatMap((entry: any) =>
      (entry.changes || []).filter((change: any) => change.field === "leadgen").map((change: any) => change.value),
    );
    if (!values.length) return { accepted: true, leads: [] };
    const leads = [];
    for (const value of values) {
      if (!value.leadgen_id) continue;
      const detail = await this.fetchMetaLead(value.leadgen_id);
      const fields = new Map<string, string>();
      for (const field of detail?.field_data || []) fields.set(field.name, field.values?.[0]);
      const identifiers = this.compactIdentifiers([
        ["meta_leadgen_id", value.leadgen_id],
        ["page_id", value.page_id],
        ["form_id", value.form_id],
        ["ad_id", value.ad_id],
        ["campaign_id", detail?.campaign_id],
        ["ad_set_id", detail?.adset_id],
      ]);
      const input: IngestLeadInput = {
        workspaceId: requestWorkspace(request),
        provider: "meta",
        sourceKind: "instant_form",
        externalLeadId: value.leadgen_id,
        displayName: fields.get("full_name") || `${fields.get("first_name") || "Meta"} ${fields.get("last_name") || `lead ${String(value.leadgen_id).slice(-6)}`}`.trim(),
        email: fields.get("email"),
        phone: fields.get("phone_number"),
        companyName: fields.get("company_name"),
        country: fields.get("country"),
        isTest: Boolean(value.is_test),
        attribution: {
          provider: "meta",
          sourceKind: "instant_form",
          occurredAt: value.created_time ? new Date(Number(value.created_time) * 1000).toISOString() : new Date().toISOString(),
          identifiers,
          consentStatus: "unknown",
          metadata: { schema: "meta-leadgen-webhook" },
        },
      };
      leads.push(await this.ingestion.ingest(input, body, "meta_leadgen"));
    }
    return { accepted: true, leads };
  }

  @Post("chatwoot")
  async chatwoot(@Body() body: any, @Req() request: Request) {
    if (!["conversation_created", "message_created"].includes(body.event)) return { ignored: true };
    if (body.message_type && body.message_type !== "incoming") return { ignored: true };
    const conversationId = String(body.conversation?.id || body.id || "");
    if (!conversationId) return { ignored: true };
    const attrs = { ...(body.conversation?.custom_attributes || {}), ...(body.contact?.custom_attributes || {}) };
    const provider: Provider = attrs.meta_leadgen_id || attrs.fbc || attrs.ctwa_clid ? "meta" : attrs.gclid || attrs.gcl_id ? "google" : "organic";
    const identifiers = this.compactIdentifiers([
      ["meta_leadgen_id", attrs.meta_leadgen_id],
      ["meta_fbc", attrs.fbc],
      ["meta_fbp", attrs.fbp],
      ["meta_ctwa_clid", attrs.ctwa_clid],
      ["google_gclid", attrs.gclid],
      ["google_gcl_id", attrs.gcl_id],
      ["campaign_id", attrs.campaign_id],
      ["ad_id", attrs.ad_id],
    ]);
    const input: IngestLeadInput = {
      workspaceId: requestWorkspace(request),
      provider,
      sourceKind: attrs.ctwa_clid ? "ctwa" : "chat",
      externalLeadId: `chatwoot:${conversationId}`,
      displayName: body.contact?.name || body.sender?.name || `Chat contact ${conversationId}`,
      email: body.contact?.email,
      phone: body.contact?.phone_number,
      waId: attrs.wa_id || body.contact?.phone_number,
      country: attrs.country,
      isTest: Boolean(attrs.is_test),
      attribution: {
        provider,
        sourceKind: attrs.ctwa_clid ? "ctwa" : "chat",
        occurredAt: new Date().toISOString(),
        identifiers,
        landingUrl: attrs.landing_url,
        utm: Object.fromEntries(Object.entries(attrs).filter(([key]) => key.startsWith("utm_"))) as Record<string, string>,
        consentStatus: attrs.consent_status || "unknown",
        metadata: { chatwootConversationId: conversationId },
      },
    };
    return this.ingestion.ingest(input, body, "chatwoot_conversation");
  }

  private compactIdentifiers(values: Array<[string, unknown]>): AdIdentifierInput[] {
    return values
      .filter((pair): pair is [AdIdentifierInput["type"], string | number] => pair[1] !== undefined && pair[1] !== null && String(pair[1]).length > 0)
      .map(([type, value]) => ({ type, value: String(value) }));
  }

  private verifyMetaSignature(request: Request & { rawBody?: Buffer }, signature?: string) {
    const secret = loadConfig().meta.appSecret;
    if (!secret) return;
    if (!signature || !request.rawBody) throw new BadRequestException("Missing Meta signature");
    const expected = `sha256=${createHmac("sha256", secret).update(request.rawBody).digest("hex")}`;
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) throw new BadRequestException("Invalid Meta signature");
  }

  private async fetchMetaLead(leadgenId: string): Promise<any | undefined> {
    const config = loadConfig();
    if (!config.meta.accessToken) return undefined;
    const url = new URL(`https://graph.facebook.com/${config.meta.graphVersion}/${leadgenId}`);
    url.searchParams.set("fields", "id,created_time,field_data,form_id,ad_id,campaign_id,adset_id");
    url.searchParams.set("access_token", config.meta.accessToken);
    const response = await fetch(url);
    if (!response.ok) throw new BadRequestException(`Meta lead fetch failed (${response.status})`);
    return response.json();
  }
}
