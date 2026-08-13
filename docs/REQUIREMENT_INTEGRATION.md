# CRM, database and intelligent requirement integration

## Runtime boundary

The local demo now uses six functional boundaries:

- `workspace-web`: the human operations console; loopback port `3000` only.
- `revenue-core`: the authenticated CRM API and transaction owner; loopback port `4100` only.
- `requirement-engine`: deterministic progressive discovery plus AKE Canonical retrieval; no host port.
- `postgres`: CRM records, project state, encrypted interaction payloads and receipts; no host port.
- `redis`: conversion jobs and retry state; no host port.
- `chatwoot-web` / `chatwoot-worker`: conversation system; only the web app has loopback port `3001`.

`backend` is an internal Docker network. PostgreSQL, Redis and the requirement engine have no direct internet route. Workspace Web also joins a dedicated `frontend` bridge so Docker can publish its loopback-only port without placing it on the shared outbound network. Revenue Core, workers, Chatwoot, Caddy and the backup agent join the separate `egress` network only where outbound access can be required.

The requirement engine receives three read-only mounts:

- an approved Canonical repository at `/knowledge:ro`;
- the installed `ake-customer-followup` Skill at `/opt/ake-followup:ro`;
- QMD at `/opt/qmd:ro`.

It copies the QMD SQLite index into an in-memory `/runtime-qmd` tmpfs at startup. Searches therefore cannot mutate the host knowledge repository. The container root filesystem is read-only and the engine has no database credentials.

The engine prefers the installed Skill's QMD adapter. If the mounted native SQLite extension is incompatible with the container's glibc, it deterministically falls back to a read-only lexical scan limited to approved Markdown under `30-canonical`; proposals, private evidence and synthesis paths remain inadmissible. `/health` executes a real retrieval probe and reports the active adapter, instead of checking mount existence only.

## Request flow

1. Workspace Web or an authorized channel adapter sends one inbound event to `POST /api/v1/requirements/analyze`.
2. Revenue Core deduplicates the stable `eventId` and reads the current `CustomerProjectState` revision.
3. Revenue Core calls the isolated requirement engine with the current state and only the current event context.
4. The engine extracts explicit project facts, preserves numeric `0`, chooses one next-best question, retrieves exact approved Canonical evidence and validates the resulting turn with the installed Skill scripts.
5. Revenue Core atomically commits the next project revision, encrypted interaction, draft-only follow-up, knowledge receipt and audit event.
6. Revenue Core reads the profile back and returns a `RequirementCommitReceipt`. Replaying the same `eventId` returns the prior receipt without another engine call or duplicate row.

No endpoint sends WhatsApp or email. `AI_AUTO_SEND=false` remains a hard invariant.

## API

### Analyze and commit

```http
POST /api/v1/requirements/analyze
x-api-key: <internal API key>
x-workspace-id: ake-demo
content-type: application/json

{
  "leadId": "lead_...",
  "conversationId": "crm:lead_...",
  "eventId": "provider-event-or-stable-import-id",
  "occurredAt": "2026-08-13T00:00:00.000Z",
  "message": "We need parking guidance for 800 spaces at a residential project.",
  "scenario": "WHATSAPP_FOLLOWUP",
  "channel": "whatsapp"
}
```

Use the real provider webhook/event ID when available. Do not derive idempotency from message text.

### Read the profile

```http
GET /api/v1/requirements/{leadId}?conversationId=crm%3Alead_...
```

The response exposes evidence-aware fields, the next-best question, draft bubbles and Canonical source receipts. It never returns the raw stored message or encryption material.

### Health

```http
GET /api/v1/requirements/health
```

The readback proves that the Skill mount and Canonical QMD snapshot are available inside the isolated container.

## Verification

Run the local stack with the existing `.env.local`:

```bash
docker compose --env-file .env.local -f compose.yaml -f compose.local.yaml up -d --build
docker compose --env-file .env.local -f compose.yaml -f compose.local.yaml ps
```

`compose.local.yaml` adds loopback-only ports and local resource limits while retaining the production Dockerfiles.

Then verify the engine health, analyze one test lead, replay the same event ID, read the resulting profile, and confirm in PostgreSQL that there is exactly one interaction and one turn for that event.

The repeatable local smoke test performs those checks, including explicit numeric `0`, draft-only handoff, Canonical source receipts, encrypted message storage and raw-message exclusion from the profile API:

```bash
npm run smoke:requirements
npm run verify:isolation
```
