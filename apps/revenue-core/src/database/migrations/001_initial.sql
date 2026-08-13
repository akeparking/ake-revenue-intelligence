CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS workspaces (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  name text NOT NULL,
  country text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS people (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  company_id text REFERENCES companies(id),
  display_name text NOT NULL,
  normalized_email text,
  normalized_phone text,
  email_hash text,
  phone_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS people_email_idx ON people(workspace_id, normalized_email) WHERE normalized_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS people_phone_idx ON people(workspace_id, normalized_phone) WHERE normalized_phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS channel_identities (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  person_id text NOT NULL REFERENCES people(id),
  provider text NOT NULL,
  external_user_id text NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, provider, external_user_id)
);

CREATE TABLE IF NOT EXISTS leads (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  person_id text REFERENCES people(id),
  company_id text REFERENCES companies(id),
  provider text NOT NULL,
  source_kind text NOT NULL,
  external_lead_id text,
  display_name text NOT NULL,
  country text,
  status text NOT NULL DEFAULT 'new',
  merge_review_required boolean NOT NULL DEFAULT false,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS leads_external_id_uq
  ON leads(workspace_id, provider, external_lead_id)
  WHERE external_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_workspace_created_idx ON leads(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS attribution_touches (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  lead_id text NOT NULL REFERENCES leads(id),
  provider text NOT NULL,
  source_kind text NOT NULL,
  occurred_at timestamptz NOT NULL,
  landing_url text,
  referrer text,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  consent_status text NOT NULL DEFAULT 'unknown',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_identifiers (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  attribution_touch_id text NOT NULL REFERENCES attribution_touches(id),
  identifier_type text NOT NULL,
  value_ciphertext text NOT NULL,
  value_hash text NOT NULL,
  preview text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, attribution_touch_id, identifier_type, value_hash)
);

CREATE TABLE IF NOT EXISTS opportunities (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  person_id text REFERENCES people(id),
  company_id text REFERENCES companies(id),
  primary_source_lead_id text NOT NULL REFERENCES leads(id),
  name text NOT NULL,
  direction text NOT NULL,
  country text NOT NULL,
  owner_id text NOT NULL,
  next_action text,
  expected_timeline text,
  amount numeric(18,2),
  currency char(3) NOT NULL DEFAULT 'USD',
  stage text NOT NULL DEFAULT 'discovery',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS opportunity_stage_history (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  opportunity_id text NOT NULL REFERENCES opportunities(id),
  from_stage text,
  to_stage text NOT NULL,
  actor_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_mirrors (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  opportunity_id text REFERENCES opportunities(id),
  erp_provider text NOT NULL,
  external_order_id text NOT NULL,
  status text NOT NULL,
  amount numeric(18,2),
  currency char(3),
  payload_hash text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, erp_provider, external_order_id)
);

CREATE TABLE IF NOT EXISTS crm_tasks (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  lead_id text REFERENCES leads(id),
  opportunity_id text REFERENCES opportunities(id),
  title text NOT NULL,
  owner_id text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (lead_id IS NOT NULL OR opportunity_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS crm_notes (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  lead_id text REFERENCES leads(id),
  opportunity_id text REFERENCES opportunities(id),
  author_id text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (lead_id IS NOT NULL OR opportunity_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS customer_project_states (
  workspace_id text NOT NULL REFERENCES workspaces(id),
  lead_id text NOT NULL REFERENCES leads(id),
  conversation_id text NOT NULL,
  contact_id text NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id, lead_id, conversation_id)
);

CREATE TABLE IF NOT EXISTS requirement_interactions (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  lead_id text NOT NULL REFERENCES leads(id),
  conversation_id text NOT NULL,
  event_id text NOT NULL,
  direction text NOT NULL,
  channel text NOT NULL,
  occurred_at timestamptz NOT NULL,
  message_ciphertext text NOT NULL,
  message_hash text NOT NULL,
  turn_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, event_id)
);

CREATE TABLE IF NOT EXISTS requirement_followups (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  lead_id text NOT NULL REFERENCES leads(id),
  conversation_id text NOT NULL,
  intent_id text NOT NULL,
  status text NOT NULL DEFAULT 'draft_only',
  channel text NOT NULL,
  current_objective text,
  next_question text,
  draft_bubbles jsonb NOT NULL DEFAULT '[]'::jsonb,
  knowledge_aggregate_hash text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, intent_id)
);

CREATE TABLE IF NOT EXISTS requirement_turns (
  turn_id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  lead_id text NOT NULL REFERENCES leads(id),
  conversation_id text NOT NULL,
  event_id text NOT NULL,
  interaction_event_id text NOT NULL,
  followup_intent_id text NOT NULL,
  project_revision integer NOT NULL,
  turn_result jsonb NOT NULL,
  next_best_question jsonb,
  handoff jsonb NOT NULL,
  answer_bubbles jsonb NOT NULL,
  knowledge_receipt jsonb,
  knowledge_aggregate_hash text,
  actor_id text NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, event_id)
);
CREATE INDEX IF NOT EXISTS requirement_turns_lead_idx
  ON requirement_turns(workspace_id, lead_id, conversation_id, committed_at DESC);

CREATE TABLE IF NOT EXISTS conversion_events (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  event_key text NOT NULL,
  event_type text NOT NULL,
  primary_source_lead_id text NOT NULL REFERENCES leads(id),
  opportunity_id text NOT NULL REFERENCES opportunities(id),
  attribution_snapshot jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, event_key)
);

CREATE TABLE IF NOT EXISTS conversion_deliveries (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  conversion_event_id text NOT NULL REFERENCES conversion_events(id),
  event_key text NOT NULL,
  event_type text NOT NULL,
  provider text NOT NULL,
  primary_source_lead_id text NOT NULL REFERENCES leads(id),
  opportunity_id text NOT NULL REFERENCES opportunities(id),
  status text NOT NULL,
  diagnostic_status text NOT NULL DEFAULT 'unknown',
  attempt_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  provider_response_id text,
  provider_error_code text,
  provider_error_message text,
  skipped_reason text,
  payload_preview jsonb,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, provider, primary_source_lead_id, event_type)
);
CREATE INDEX IF NOT EXISTS conversion_delivery_queue_idx ON conversion_deliveries(status, next_retry_at, created_at);

CREATE TABLE IF NOT EXISTS raw_events (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  provider text NOT NULL,
  event_type text NOT NULL,
  external_event_id text,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  received_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS raw_events_external_uq
  ON raw_events(workspace_id, provider, external_event_id)
  WHERE external_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS audit_log (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  actor_id text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO workspaces(id, name) VALUES ('ake-demo', 'AKE Shadow Pilot') ON CONFLICT (id) DO NOTHING;
