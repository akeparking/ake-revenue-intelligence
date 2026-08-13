import { loadConfig, type AppConfig } from "../config";

export interface ModelSuggestion {
  provider: string;
  autoSend: false;
  summary: string;
  intent: string;
  qualification: Record<string, unknown>;
  suggestedTags: string[];
  suggestedAction: string;
  replyDraft: string;
  confidence: number;
  warnings: string[];
}

export interface ModelProviderAdapter {
  healthCheck(): Promise<{ healthy: boolean; provider: string; model?: string }>;
  generateStructuredSuggestion(input: Record<string, unknown>): Promise<ModelSuggestion>;
}

export interface ErpAdapter {
  testConnection(): Promise<{ healthy: boolean; provider: string }>;
  upsertCustomer(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  upsertOrder(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  getOrderStatus(externalOrderId: string): Promise<Record<string, unknown>>;
}

export class MockModelAdapter implements ModelProviderAdapter {
  async healthCheck() { return { healthy: true, provider: "mock", model: "deterministic-demo" }; }
  async generateStructuredSuggestion(input: Record<string, unknown>): Promise<ModelSuggestion> {
    return {
      provider: "mock",
      autoSend: false,
      summary: input.message ? "Customer asked about a project-specific parking solution." : "No message content provided.",
      intent: "solution_inquiry",
      qualification: { country: input.country || null, projectDirection: input.direction || null },
      suggestedTags: ["project-inquiry", "human-review"],
      suggestedAction: "Confirm project size, timeline, and decision role.",
      replyDraft: "Thank you for the project details. Could you share the location, expected timeline, and approximate number of parking spaces?",
      confidence: 0.72,
      warnings: ["Draft only. Human approval is required before sending."],
    };
  }
}

export class OpenAiCompatibleModelAdapter implements ModelProviderAdapter {
  constructor(private readonly config: AppConfig = loadConfig()) {}
  async healthCheck() {
    return { healthy: Boolean(this.config.ai.baseUrl && this.config.ai.model && this.config.ai.apiKey), provider: this.config.ai.provider, model: this.config.ai.model };
  }
  async generateStructuredSuggestion(input: Record<string, unknown>): Promise<ModelSuggestion> {
    if (!this.config.ai.baseUrl || !this.config.ai.model || !this.config.ai.apiKey) throw new Error("Model gateway configuration is incomplete");
    const response = await fetch(`${this.config.ai.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.config.ai.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.config.ai.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return JSON with summary, intent, qualification, suggestedTags, suggestedAction, replyDraft, confidence and warnings. Never claim to send a message or change CRM state." },
          { role: "user", content: JSON.stringify(input) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Model gateway request failed (${response.status})`);
    const body: any = await response.json();
    const parsed = JSON.parse(body.choices?.[0]?.message?.content || "{}");
    return { provider: this.config.ai.provider, autoSend: false, ...parsed } as ModelSuggestion;
  }
}

export class MockErpAdapter implements ErpAdapter {
  async testConnection() { return { healthy: true, provider: "mock" }; }
  async upsertCustomer(input: Record<string, unknown>) { return { provider: "mock", externalId: input.externalId || `erp_customer_${Date.now()}`, status: "accepted", idempotent: true }; }
  async upsertOrder(input: Record<string, unknown>) { return { provider: "mock", externalOrderId: input.externalOrderId || `erp_order_${Date.now()}`, status: input.status || "draft", idempotent: true }; }
  async getOrderStatus(externalOrderId: string) { return { provider: "mock", externalOrderId, status: "draft" }; }
}

export class ErpNextAdapter implements ErpAdapter {
  constructor(private readonly config: AppConfig = loadConfig()) {}
  private headers() { return { authorization: `token ${this.config.erp.apiKey}`, "content-type": "application/json" }; }
  private baseUrl() {
    if (!this.config.erp.baseUrl || !this.config.erp.apiKey) throw new Error("ERPNext sandbox configuration is incomplete");
    return this.config.erp.baseUrl.replace(/\/$/, "");
  }
  async testConnection() {
    const response = await fetch(`${this.baseUrl()}/api/method/frappe.auth.get_logged_user`, { headers: this.headers() });
    return { healthy: response.ok, provider: "erpnext" };
  }
  async upsertCustomer(input: Record<string, unknown>) {
    const externalId = String(input.externalId || "");
    if (!externalId) throw new Error("externalId is required for ERP customer idempotency");
    const response = await fetch(`${this.baseUrl()}/api/resource/Customer/${encodeURIComponent(externalId)}`, { method: "PUT", headers: this.headers(), body: JSON.stringify(input) });
    if (!response.ok) throw new Error(`ERPNext customer upsert failed (${response.status})`);
    return response.json() as Promise<Record<string, unknown>>;
  }
  async upsertOrder(input: Record<string, unknown>) {
    const externalOrderId = String(input.externalOrderId || "");
    if (!externalOrderId) throw new Error("externalOrderId is required for ERP order idempotency");
    const response = await fetch(`${this.baseUrl()}/api/resource/Sales Order/${encodeURIComponent(externalOrderId)}`, { method: "PUT", headers: this.headers(), body: JSON.stringify(input) });
    if (!response.ok) throw new Error(`ERPNext order upsert failed (${response.status})`);
    return response.json() as Promise<Record<string, unknown>>;
  }
  async getOrderStatus(externalOrderId: string) {
    const response = await fetch(`${this.baseUrl()}/api/resource/Sales Order/${encodeURIComponent(externalOrderId)}`, { headers: this.headers() });
    if (!response.ok) throw new Error(`ERPNext order lookup failed (${response.status})`);
    return response.json() as Promise<Record<string, unknown>>;
  }
}

export function modelAdapter(config: AppConfig = loadConfig()): ModelProviderAdapter {
  return config.ai.provider === "mock" ? new MockModelAdapter() : new OpenAiCompatibleModelAdapter(config);
}

export function erpAdapter(config: AppConfig = loadConfig()): ErpAdapter {
  return config.erp.provider === "erpnext" ? new ErpNextAdapter(config) : new MockErpAdapter();
}
