# v0.1 acceptance record

Date: 2026-10-02, Asia/Shanghai. All submitted inquiries, screenshots and published receipts use fictional demo data.

| Definition of Done | Result and evidence |
|---|---|
| URL is reachable | Passed: custom HTTPS domain, website, native Chatwoot login and [project page](https://demo.jayln3.my:8443/sales) return HTTP 200 |
| Create / receive an inquiry | Passed: actual website widget submission, conversation 6 / message 28 |
| AI automatically parses the inquiry | Passed: a real Codex analysis arrived through the reception bridge |
| AI results are saved to the Lead | Passed: 800 spaces and source evidence persisted; human review saved separately |
| Lead becomes an Opportunity | Passed: authenticated UI creation; repeated commands return the same opportunity |
| Opportunity stage can change | Passed: Discovery → Solution, with version checking and audit history |
| Qualified triggers a Conversion Event | Passed: explicit human checks created one stable event and one accepted Mock receipt |
| Three demo datasets | Passed: GCC high intent, SEA exploratory integrator, non-target applicant |
| README | Completed: business problem, public links, reproducible setup, scope and verification |
| Architecture diagram | Completed: [SVG](architecture.svg), [Mermaid source](architecture.mmd), [data ownership](ARCHITECTURE.md) |
| Demo video | Final recording and publication in progress |
| GitHub is portfolio-ready | Source and evidence prepared; final publication in progress |

## Runtime proof

The [live website receipt](evidence/live-website.json) traces the original widget message through a real model, automatic CRM import, field review, opportunity creation, stage update and qualification. There was no manual API injection of the model result. The resulting event is `qualified:ake-demo:lead_7dacab99-d854-49c0-a3d9-d46da1713cfd:v1`.

The [restart and replay receipt](evidence/restart-readback.json) verifies the same inquiry ID and event ID on replay, then identical records and stage versions after restarting the API, workspace and reception service. Before/after counts were 4 Leads, 1 Opportunity and 1 delivery. These counts describe that acceptance run, not a fixed dashboard total.

The [local browser receipt](evidence/local-browser.json) records 14 checks: operator login, unauthenticated API rejection, intake, automatic analysis, reviewed Lead, opportunity, stage, human qualification, Mock receipt, replay deduplication, bridge-route isolation, origin protection, mobile overflow and no browser page errors.

## Code verification

- 27 tests passed: 4 requirement-engine, 2 shared-contract, 19 core (including real PostgreSQL) and 2 formatting tests.
- TypeScript checks and production builds passed.
- Public-source scan and Git whitespace checks passed. No database dump, credential file, private knowledge file, raw customer export or machine-specific path is part of the release.
- The [CI workflow](../.github/workflows/ci.yml) repeats dependency installation, migrations, PostgreSQL tests, type checks, build and the public-source scan.

## Deployment and boundaries

The custom domain uses HTTPS port **8443** so the server's pre-existing 443 service remains unchanged. The operator workspace is password-protected; the public page, diagram and video do not require login. The generated operator credential stays in the private deployment configuration and is not published in GitHub.

Revenue Core and the web app each have a 192 MiB container limit. Observed idle usage after the first rollout was approximately 40 MiB and 37 MiB; this is a low-concurrency demo observation, not a load test. PostgreSQL persists the workflow. A verified private backup contains the database dump, service configuration, field key and a consistent reception SQLite copy. Backup integrity checks and a service restart are verified; a full disaster-recovery restore drill is not claimed.

Website reception and Codex analysis are connected and receipt-verified. Seeded/operator-created offline inquiries, Email/WhatsApp channels and advertising feedback are explicitly **Mock**. No live advertising delivery or matching, paid-media spend, OKKI write or Feishu write occurred. One conversation represents one inquiry project in v0.1.
