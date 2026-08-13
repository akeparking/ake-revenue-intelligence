# Shadow Pilot runbook

## Guardrails

- OKKI and Feishu receive zero writes.
- `ADS_MODE=mock` and `GOOGLE_VALIDATE_ONLY=true` stay enabled until platform test events are reconciled.
- `AI_AUTO_SEND=false` is enforced by the application and startup fails if it is changed.
- Use only official WhatsApp Cloud API through Chatwoot for production-path tests.

## Deployment order

1. Point three DNS records to the VPS: CRM app, API/Webhooks, and Chatwoot.
2. Install Docker with `scripts/bootstrap-ubuntu.sh`.
3. Copy `.env.production.example` to `.env` and replace every placeholder with generated secrets. Do not reuse the SSH password.
4. Start dependencies and migrations: `docker compose up -d postgres redis revenue-migrate`.
5. Start Chatwoot and create the admin account: `docker compose up -d chatwoot-migrate chatwoot-web chatwoot-worker`.
6. Start Revenue Core, Worker, Web and Caddy: `docker compose up -d --build`.
7. Verify `https://<API_DOMAIN>/health`, `https://<API_DOMAIN>/openapi.json`, CRM API-key boundary, and Chatwoot.

## Ads activation gates

1. Meta: verify webhook challenge, run an official test Lead, confirm the real `leadgen_id`, then use Test Events for a `QualifiedLead` created from an Opportunity.
2. Google: post an official test Lead Form payload, prove `lead_id` deduplication and separate `gcl_id`, then upload a validate-only Data Manager event and inspect request status.
3. Only after payload readback and identity review: switch the single connector under test to live mode.
4. API `accepted` is not platform `matched`; record both states in the delivery ledger.

## Recovery drill

Every month, restore both `revenue_crm` and `chatwoot` dumps into isolated databases, restore a versioned attachment object, and record start/end time. Target RPO is one hour after WAL archiving is configured; the included daily dump is a baseline and does not by itself satisfy the one-hour RPO.
