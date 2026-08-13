# Repository instructions

- Run development, test, and build commands from the repository root with Node.js 24+.
- Treat `DESIGN.md` as the visual source of truth. Use `design-md-orchestrator` before frontend changes.
- Never log access tokens, raw webhook secrets, full phone numbers, full email addresses, or raw customer messages.
- Keep Meta Lead Ads ingestion, website CAPI, CRM-stage feedback, and Google Data Manager ingestion as separate adapters.
- `Lead`, platform lead IDs, click IDs, CRM IDs, and conversion event IDs are distinct identifiers.
- Preserve Shadow Pilot mode: no OKKI or Feishu writes exist in this repository.
- Public examples must remain fictional; never commit CRM exports, customer messages, credentials, local knowledge files, or machine-specific paths.
