import { Controller, Get } from "@nestjs/common";

const json = { "application/json": { schema: { type: "object" } } };
const ok = { "200": { description: "Successful response", content: json } };

@Controller()
export class OpenApiController {
  @Get("openapi.json")
  document() {
    return {
      openapi: "3.1.0",
      info: {
        title: "AKE Revenue CRM API",
        version: "0.1.0",
        description: "Shadow-pilot CRM, attribution and idempotent Qualified feedback API.",
      },
      servers: [{ url: "/" }],
      components: {
        securitySchemes: { ApiKey: { type: "apiKey", in: "header", name: "x-api-key" } },
      },
      security: [{ ApiKey: [] }],
      paths: {
        "/health": { get: { security: [], responses: ok } },
        "/metrics": { get: { security: [], responses: { "200": { description: "Prometheus text metrics" } } } },
        "/webhooks/meta/leadgen": {
          get: { security: [], summary: "Verify Meta leadgen webhook", responses: ok },
          post: { security: [], summary: "Receive signed Meta leadgen events", requestBody: { content: json }, responses: ok },
        },
        "/webhooks/google/leadform/{connectorId}": {
          post: { security: [], summary: "Receive Google Lead Form webhook", parameters: [{ name: "connectorId", in: "path", required: true, schema: { type: "string" } }], requestBody: { content: json }, responses: ok },
        },
        "/webhooks/chatwoot": { post: { security: [], summary: "Receive Chatwoot events", requestBody: { content: json }, responses: ok } },
        "/api/v1/leads": {
          get: { summary: "List leads", responses: ok },
          post: { summary: "Ingest a lead", requestBody: { required: true, content: json }, responses: { "201": { description: "Lead created", content: json } } },
        },
        "/api/v1/opportunities": {
          get: { summary: "List opportunities", responses: ok },
          post: { summary: "Create an opportunity and atomically queue Qualified feedback", requestBody: { required: true, content: json }, responses: { "201": { description: "Opportunity and delivery ledger entry created", content: json }, "400": { description: "Qualification fields are incomplete" } } },
        },
        "/api/v1/dashboard": { get: { summary: "Get command-center snapshot", responses: ok } },
        "/api/v1/conversion-deliveries": { get: { summary: "List conversion deliveries", responses: ok } },
        "/api/v1/conversion-deliveries/process": { post: { summary: "Process pending outbox events", responses: ok } },
        "/api/v1/conversion-deliveries/{id}/replay": {
          post: { summary: "Replay a failed delivery with the original event ID", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: ok },
        },
        "/api/v1/ai/suggestions": { post: { summary: "Generate a draft-only AI suggestion", requestBody: { content: json }, responses: ok } },
        "/api/v1/requirements/health": { get: { summary: "Check the isolated requirement engine and Canonical knowledge mount", responses: ok } },
        "/api/v1/requirements/analyze": { post: { summary: "Analyze an inbound event and atomically persist project state, interaction, follow-up and knowledge receipt", requestBody: { required: true, content: json }, responses: { "201": { description: "Requirement turn committed or replayed", content: json }, "409": { description: "Project revision conflict" } } } },
        "/api/v1/requirements/{leadId}": { get: { summary: "Read the latest evidence-aware requirement profile for a lead", parameters: [{ name: "leadId", in: "path", required: true, schema: { type: "string" } }, { name: "conversationId", in: "query", required: false, schema: { type: "string" } }], responses: ok } },
        "/api/v1/erp/health": { get: { summary: "Test ERP adapter configuration", responses: ok } },
        "/api/v1/erp/customers/upsert": { post: { summary: "Idempotently upsert an ERP customer", requestBody: { content: json }, responses: ok } },
        "/api/v1/erp/orders/upsert": { post: { summary: "Idempotently upsert an ERP order mirror", requestBody: { content: json }, responses: ok } },
        "/api/v1/connectors/okki/status": { get: { summary: "Inspect read-only OKKI connector status", responses: ok } },
        "/api/v1/connectors/okki/sync": { post: { summary: "Pull a bounded batch of current and converted OKKI inquiries", requestBody: { content: json }, responses: ok } },
      },
    };
  }
}
