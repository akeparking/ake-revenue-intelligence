# Three-minute demonstration

The demo follows one fictional project through an operating decision, rather than presenting disconnected CRM screens.

1. Open the website and submit a fictional project through its Chatwoot widget. State the city, project scale and products. Do not enter real customer information.
2. Open **Unified inbox** in the sales workspace. The original message, source conversation link and model result appear automatically. `AI · codex` identifies a verified model receipt; seeded and operator-created offline examples say `Mock`.
3. Inspect exact source evidence. A country inferred from a city is labeled **inferred**. Unknown company, budget and capacity remain blank; explicit zero stays zero.
4. Correct a field if needed, then choose **Confirm fields to Lead**. Later AI suggestions cannot overwrite the reviewed fields.
5. Choose **Create opportunity**. It begins in Discovery without automatically marking the Lead qualified.
6. Move the card to Solution by dragging it or using the stage selector. The activity timeline records the change.
7. Choose **Review Qualified**. Confirm contact reachability, relevant need, target buyer role and next action. The transaction marks the Lead qualified and creates one stable event.
8. Open **Feedback delivery** and expand **Payload and receipt**. `Mock receipt` proves the local delivery contract; it does not mean an ad platform matched or attributed a sale. Repeating qualification returns the same event.
9. Compare the GCC, Southeast Asia and non-target fixtures. Open **Integrations** to see which capabilities are verified, Mock or not connected.

## Fixtures

| Scenario | Channel | Expected suggestion | Missing information |
|---|---|---|---|
| GCC shopping mall, Riyadh, 800 spaces | Website fixture | High | Company unknown; country inferred |
| Manila systems integrator exploring ANPR/API | Email Mock | Medium | Capacity, budget and confirmed project unknown |
| Job applicant with no business project | WhatsApp Mock | Low | No target buying need |

Source: `packages/contracts/src/demo-fixtures.ts`. Every fixture is fictional and marked `isTest=true`. Scores are explainable demo suggestions, not purchase probabilities.

## Browser acceptance

With an isolated PostgreSQL test database, build and run the API and production web server, then run:

```bash
WORKFLOW_URL=http://127.0.0.1:3010/sales \
WORKSPACE_PASSWORD=your-local-test-password \
SNAPSHOT_DIR=/tmp/sales-workflow-evidence \
python scripts/smoke-workflow.py
```

The Python environment needs Playwright and Chromium. `BROWSER_EXECUTABLE` can select an existing browser binary. The script checks authentication, intake, automatic analysis, field review, opportunity creation, stage updates, explicit qualification, Mock receipt, replay deduplication, bridge isolation, origin protection, mobile overflow and browser errors. It submits fictional data only.
