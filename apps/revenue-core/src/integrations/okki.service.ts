import { BadGatewayException, BadRequestException, Injectable } from "@nestjs/common";
import type { AdIdentifierInput, IngestLeadInput, Provider } from "@ake/contracts";
import { loadConfig } from "../config";
import { IngestionService } from "../ingestion/ingestion.service";

type JsonRecord = Record<string, any>;

interface OkkiSyncResult {
  startedAt: string;
  completedAt: string;
  readOnly: true;
  requested: number;
  processed: number;
  failed: number;
  activeRead: number;
  convertedRead: number;
  providerCounts: Record<string, number>;
  failures: Array<{ okkiLeadId: string; reason: string }>;
}

function asString(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function firstPhone(contact: JsonRecord | undefined, detail: JsonRecord): string | undefined {
  const candidates: unknown[] = [detail.tel, detail.phone, contact?.tel, contact?.phone];
  if (Array.isArray(contact?.tel_list)) {
    for (const item of contact.tel_list) {
      if (typeof item === "string") candidates.push(item);
      else if (item && typeof item === "object") candidates.push(item.tel, item.phone, item.mobile, item.value, ...Object.values(item));
    }
  }
  return candidates.map(asString).find((value) => value && /\d{6,}/.test(value.replace(/\D/g, "")));
}

function occurredAt(value: unknown): string {
  if (typeof value === "number" || /^\d{10,13}$/.test(String(value || ""))) {
    const raw = Number(value);
    const date = new Date(raw < 10_000_000_000 ? raw * 1000 : raw);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function normalizeOkkiLead(detail: JsonRecord, archive: "active" | "converted", workspaceId: string): IngestLeadInput {
  const okkiLeadId = asString(detail.lead_id);
  if (!okkiLeadId) throw new Error("OKKI lead_id is missing");
  const contacts = Array.isArray(detail.customers) ? detail.customers.filter((item: unknown): item is JsonRecord => Boolean(item && typeof item === "object")) : [];
  const main = contacts.find((contact: JsonRecord) => Number(contact.main_customer_flag) === 1) || contacts[0];
  const relate = detail.relate_info && typeof detail.relate_info === "object" ? detail.relate_info : {};
  const origin = asString(detail.origin_name) || "OKKI";
  const metaLeadId = asString(relate.facebook_lead_id);
  const googleLeadId = asString(relate.google_lead_id);
  const provider: Provider = metaLeadId || /facebook|meta/i.test(origin) ? "meta" : googleLeadId || /google/i.test(origin) ? "google" : "organic";
  const identifiers: AdIdentifierInput[] = [];
  const add = (type: AdIdentifierInput["type"], value: unknown) => {
    const normalized = asString(value);
    if (normalized) identifiers.push({ type, value: normalized });
  };
  add("meta_leadgen_id", metaLeadId);
  add("page_id", relate.facebook_page_id);
  add("form_id", relate.facebook_form_id || relate.google_form_id);
  add("ad_id", relate.facebook_ad_id);
  add("google_lead_id", googleLeadId);
  add("google_gcl_id", relate.google_gcl_id);
  add("google_gclid", relate.gclid);
  add("campaign_id", relate.campaign_id);

  return {
    workspaceId,
    provider,
    sourceKind: metaLeadId || googleLeadId ? "instant_form" : "manual",
    externalLeadId: metaLeadId || googleLeadId || `okki:${okkiLeadId}`,
    displayName: asString(main?.name) || asString(detail.name) || `OKKI lead ${okkiLeadId.slice(-6)}`,
    email: asString(main?.email),
    phone: firstPhone(main, detail),
    companyName: asString(detail.company_name),
    country: asString(detail.country) || asString(detail.country_name),
    isTest: false,
    attribution: {
      provider,
      sourceKind: metaLeadId || googleLeadId ? "instant_form" : "manual",
      occurredAt: occurredAt(detail.create_time || detail.order_time || detail.update_time),
      identifiers,
      consentStatus: "unknown",
      metadata: {
        importedFrom: "okki-read-only",
        okkiLeadId,
        okkiSerialId: asString(detail.serial_id),
        okkiArchive: archive,
        okkiOriginName: origin,
        okkiStatusId: asString(detail.status),
        okkiStatusName: asString(detail.status_name),
      },
    },
  };
}

@Injectable()
export class OkkiService {
  private lastSync?: OkkiSyncResult;
  constructor(private readonly ingestion: IngestionService) {}

  status() {
    const config = loadConfig();
    return {
      enabled: config.okki.enabled,
      configured: Boolean(config.okki.clientId && config.okki.clientSecret),
      mode: "read-only",
      pulls: ["active", "converted"],
      lastSync: this.lastSync,
    };
  }

  async sync(workspaceId: string, requestedLimit?: number, includeConverted = true): Promise<OkkiSyncResult> {
    const config = loadConfig();
    if (!config.okki.enabled) throw new BadRequestException("OKKI sync is disabled");
    if (!config.okki.clientId || !config.okki.clientSecret) throw new BadRequestException("OKKI credentials are not configured");
    const limit = Math.max(1, Math.min(Number(requestedLimit || config.okki.defaultLimit), 100));
    const startedAt = new Date().toISOString();
    const token = await this.token();
    const active = await this.list(token, limit);
    const converted = includeConverted ? await this.list(token, limit, 2) : [];
    const summaries = [
      ...active.map((item) => ({ item, archive: "active" as const })),
      ...converted.map((item) => ({ item, archive: "converted" as const })),
    ];
    const result: OkkiSyncResult = {
      startedAt,
      completedAt: startedAt,
      readOnly: true,
      requested: summaries.length,
      processed: 0,
      failed: 0,
      activeRead: active.length,
      convertedRead: converted.length,
      providerCounts: {},
      failures: [],
    };
    for (const { item, archive } of summaries) {
      const id = asString(item.lead_id) || "unknown";
      try {
        const detail = await this.detail(token, id);
        const input = normalizeOkkiLead(detail, archive, workspaceId);
        await this.ingestion.ingest(input, detail, `okki_${archive}_pull`);
        result.processed += 1;
        result.providerCounts[input.provider] = (result.providerCounts[input.provider] || 0) + 1;
      } catch (error) {
        result.failed += 1;
        result.failures.push({ okkiLeadId: id, reason: error instanceof Error ? error.message.slice(0, 160) : "Unknown OKKI import failure" });
      }
    }
    result.completedAt = new Date().toISOString();
    this.lastSync = result;
    return result;
  }

  private async token(): Promise<string> {
    const config = loadConfig();
    const body = new URLSearchParams({ grant_type: "client_credentials", client_id: config.okki.clientId!, client_secret: config.okki.clientSecret!, scope: "lead" });
    let response = await fetch(`${config.okki.baseUrl}/v1/oauth2/access_token`, { method: "POST", headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body });
    if (!response.ok) {
      response = await fetch(`${config.okki.baseUrl}/v1/oauth2/access_token`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(body)) });
    }
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) throw new BadGatewayException(`OKKI authentication failed (${response.status})`);
    return payload.access_token;
  }

  private async list(token: string, count: number, archive?: number): Promise<JsonRecord[]> {
    const config = loadConfig();
    const url = new URL(`${config.okki.baseUrl}/v1/lead/list`);
    url.searchParams.set("start_index", "1");
    url.searchParams.set("count", String(count));
    url.searchParams.set("sort_field", "update_time");
    if (archive) url.searchParams.set("archive", String(archive));
    const payload = await this.request(url, token);
    const list = payload.data?.list;
    if (!Array.isArray(list)) throw new BadGatewayException("OKKI lead list returned an invalid data.list");
    return list;
  }

  private async detail(token: string, leadId: string): Promise<JsonRecord> {
    const config = loadConfig();
    const url = new URL(`${config.okki.baseUrl}/v1/lead/info`);
    url.searchParams.set("lead_id", leadId);
    const payload = await this.request(url, token);
    if (!payload.data || typeof payload.data !== "object") throw new BadGatewayException(`OKKI lead ${leadId} returned invalid detail data`);
    return payload.data;
  }

  private async request(url: URL, token: string): Promise<JsonRecord> {
    let lastStatus = 0;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(url, { headers: { accept: "application/json", authorization: token } });
      lastStatus = response.status;
      const payload: any = await response.json().catch(() => ({}));
      if (response.ok && [undefined, null, 200].includes(payload.code)) return payload;
      if (![429, 500, 502, 503, 504].includes(response.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 500));
    }
    throw new BadGatewayException(`OKKI request failed (${lastStatus})`);
  }
}
