# OKKI read-only inquiry import

The OKKI connector is an external lead source for migration, reconciliation and shadow-pilot data. It never creates, merges, updates or deletes OKKI records.

## Configuration

Set `OKKI_SYNC_ENABLED=true`, `OKKI_CLIENT_ID`, `OKKI_CLIENT_SECRET`, and the documented API base URL. Credentials stay server-side. The browser calls the Revenue Core proxy and never receives the OKKI token.

## Pull contract

`POST /api/v1/connectors/okki/sync` accepts a bounded `limit` from 1 to 100 and `includeConverted`. Each run reads both:

- current inquiries from `GET /v1/lead/list`;
- converted inquiries from the same endpoint with `archive=2`;
- detail records from `GET /v1/lead/info`.

Example internal request:

```json
{ "limit": 10, "includeConverted": true }
```

The same batch can be pulled repeatedly. A real Meta or Google Lead ID is the inbound idempotency key when present; otherwise the namespaced OKKI Lead ID is used. Identity matching remains conservative: exact verified email/phone can link a Person, while name-only matches never auto-merge.

## Attribution rules

- A real `facebook_lead_id` becomes `meta_leadgen_id`; form, Page and Ad IDs remain distinct.
- A real Google Lead ID, GCL ID or click ID is stored in its corresponding field.
- The OKKI Lead ID stays in source metadata and never becomes a platform Lead ID or Click ID.
- Facebook/Google campaign or ad hierarchy IDs alone are not sufficient for Qualified feedback. Those opportunities receive `skipped:no_attribution` until a matchable lead/click identity exists.
- Current and converted counts, failures and provider counts are returned as aggregates. Customer PII is not written to application logs.
