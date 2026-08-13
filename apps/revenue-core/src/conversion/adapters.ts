import { sha256 } from "../common/crypto";
import { loadConfig, type AppConfig } from "../config";
import type { QualifiedContext } from "../store/store.types";

export interface AdapterResult {
  responseId: string;
  diagnosticStatus: "unknown" | "matched" | "unmatched" | "warning";
}

export class AdapterError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface AdsConversionAdapter {
  validateConfiguration(): Promise<{ valid: boolean; message: string }>;
  buildQualifiedPayload(context: QualifiedContext): Record<string, unknown>;
  send(payload: Record<string, unknown>): Promise<AdapterResult>;
  queryDiagnostics(responseId: string): Promise<AdapterResult["diagnosticStatus"]>;
  refreshCredentials(): Promise<void>;
}

function identifierMap(context: QualifiedContext) {
  return new Map(context.identifiers.map((item) => [item.type, item.value]));
}

function userHashes(context: QualifiedContext) {
  return {
    email: context.lead.email ? sha256(context.lead.email) : undefined,
    phone: context.lead.phone ? sha256(context.lead.phone) : undefined,
    externalId: sha256(context.lead.personId || context.lead.id),
  };
}

export class MockAdsAdapter implements AdsConversionAdapter {
  constructor(private readonly provider: string) {}
  async validateConfiguration() { return { valid: true, message: `${this.provider} mock adapter ready` }; }
  buildQualifiedPayload(context: QualifiedContext): Record<string, unknown> {
    return {
      provider: this.provider,
      eventName: "QualifiedLead",
      eventId: context.delivery.eventId,
      occurredAt: context.delivery.occurredAt,
      sourceLead: context.lead.id,
      opportunity: context.opportunity.id,
      mode: "mock",
    };
  }
  async send(payload: Record<string, unknown>): Promise<AdapterResult> {
    return { responseId: `mock_${sha256(JSON.stringify(payload)).slice(0, 16)}`, diagnosticStatus: "unknown" };
  }
  async queryDiagnostics(): Promise<AdapterResult["diagnosticStatus"]> {
    return "unknown";
  }
  async refreshCredentials() {}
}

export class MetaAdsAdapter implements AdsConversionAdapter {
  constructor(private readonly config: AppConfig = loadConfig()) {}

  async validateConfiguration() {
    const valid = Boolean(this.config.meta.accessToken && this.config.meta.datasetId);
    return { valid, message: valid ? "Meta dataset configuration present" : "Meta access token or dataset ID missing" };
  }

  buildQualifiedPayload(context: QualifiedContext): Record<string, unknown> {
    const ids = identifierMap(context);
    const hashes = userHashes(context);
    const userData: Record<string, unknown> = {};
    const leadId = ids.get("meta_leadgen_id");
    if (leadId) userData.lead_id = leadId;
    if (ids.get("meta_fbc")) userData.fbc = ids.get("meta_fbc");
    if (ids.get("meta_fbp")) userData.fbp = ids.get("meta_fbp");
    if (ids.get("meta_ctwa_clid")) userData.ctwa_clid = ids.get("meta_ctwa_clid");
    if (hashes.email) userData.em = [hashes.email];
    if (hashes.phone) userData.ph = [hashes.phone];
    userData.external_id = [hashes.externalId];
    return {
      data: [
        {
          event_name: "QualifiedLead",
          event_time: Math.floor(new Date(context.delivery.occurredAt).getTime() / 1000),
          event_id: context.delivery.eventId,
          ...(context.lead.sourceKind === "website" ? { action_source: "website" } : {}),
          user_data: userData,
          custom_data: {
            event_source: "crm",
            lead_event_source: this.config.meta.leadEventSource,
            crm_lead_id: context.lead.id,
            opportunity_id: context.opportunity.id,
            lead_stage: "Qualified Lead",
          },
        },
      ],
    };
  }

  async send(payload: Record<string, unknown>): Promise<AdapterResult> {
    const { accessToken, datasetId, graphVersion } = this.config.meta;
    if (!accessToken || !datasetId) throw new AdapterError("Meta live credentials are incomplete", "META_CONFIG", false);
    const url = new URL(`https://graph.facebook.com/${graphVersion}/${datasetId}/events`);
    url.searchParams.set("access_token", accessToken);
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = String(body?.error?.code || response.status);
      throw new AdapterError(body?.error?.message || "Meta request failed", code, response.status === 429 || response.status >= 500);
    }
    return { responseId: body.fbtrace_id || body.events_received?.toString() || `meta_${Date.now()}`, diagnosticStatus: "unknown" };
  }

  async queryDiagnostics(): Promise<AdapterResult["diagnosticStatus"]> {
    return "unknown";
  }

  async refreshCredentials() {
    throw new AdapterError("Meta credential rotation requires an operator-managed secret update", "META_REFRESH_EXTERNAL", false);
  }
}

export class GoogleAdsAdapter implements AdsConversionAdapter {
  constructor(private readonly config: AppConfig = loadConfig()) {}

  async validateConfiguration() {
    const valid = Boolean(this.config.google.accessToken && this.config.google.adsAccountId && this.config.google.conversionActionId);
    return { valid, message: valid ? "Google Data Manager configuration present" : "Google token, account or conversion action missing" };
  }

  buildQualifiedPayload(context: QualifiedContext): Record<string, unknown> {
    const ids = identifierMap(context);
    const hashes = userHashes(context);
    const adIdentifiers: Record<string, string> = {};
    const gclid = ids.get("google_gclid") || ids.get("google_gcl_id");
    if (gclid) adIdentifiers.gclid = gclid;
    if (ids.get("google_gbraid")) adIdentifiers.gbraid = ids.get("google_gbraid")!;
    if (ids.get("google_wbraid")) adIdentifiers.wbraid = ids.get("google_wbraid")!;
    if (ids.get("google_session_attributes")) adIdentifiers.sessionAttributes = ids.get("google_session_attributes")!;
    const userIdentifiers = [
      hashes.email ? { emailAddress: hashes.email.toUpperCase() } : undefined,
      hashes.phone ? { phoneNumber: hashes.phone.toUpperCase() } : undefined,
    ].filter(Boolean);
    return {
      destinations: [
        {
          operatingAccount: { accountType: "GOOGLE_ADS", accountId: this.config.google.adsAccountId },
          productDestinationId: this.config.google.conversionActionId,
        },
      ],
      events: [
        {
          eventTimestamp: context.delivery.occurredAt,
          transactionId: context.delivery.eventId,
          eventSource: "OTHER",
          adIdentifiers,
          userData: userIdentifiers.length ? { userIdentifiers } : undefined,
        },
      ],
      encoding: "HEX",
      validateOnly: this.config.google.validateOnly,
    };
  }

  async send(payload: Record<string, unknown>): Promise<AdapterResult> {
    const { accessToken, adsAccountId, conversionActionId } = this.config.google;
    if (!accessToken || !adsAccountId || !conversionActionId) {
      throw new AdapterError("Google Data Manager live credentials are incomplete", "GOOGLE_CONFIG", false);
    }
    const response = await fetch("https://datamanager.googleapis.com/v1/events:ingest", {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new AdapterError(body?.error?.message || "Google request failed", String(body?.error?.status || response.status), response.status === 429 || response.status >= 500);
    }
    return { responseId: body.requestId || `google_${Date.now()}`, diagnosticStatus: "unknown" };
  }

  async queryDiagnostics(responseId: string): Promise<AdapterResult["diagnosticStatus"]> {
    if (!this.config.google.accessToken) return "unknown";
    const url = new URL("https://datamanager.googleapis.com/v1/requestStatus:retrieve");
    url.searchParams.set("requestId", responseId);
    const response = await fetch(url, { headers: { authorization: `Bearer ${this.config.google.accessToken}` } });
    if (!response.ok) return "warning";
    const body: any = await response.json();
    if (body.processingErrors?.length) return "unmatched";
    if (body.processingWarnings?.length) return "warning";
    return body.done ? "matched" : "unknown";
  }

  async refreshCredentials() {
    throw new AdapterError("Google OAuth refresh is delegated to the secret broker", "GOOGLE_REFRESH_EXTERNAL", false);
  }
}

export function adapterFor(provider: string): AdsConversionAdapter {
  const config = loadConfig();
  if (config.adsMode === "mock") return new MockAdsAdapter(provider);
  if (provider === "meta") return new MetaAdsAdapter(config);
  if (provider === "google") return new GoogleAdsAdapter(config);
  throw new AdapterError(`No adapter for ${provider}`, "UNSUPPORTED_PROVIDER", false);
}
