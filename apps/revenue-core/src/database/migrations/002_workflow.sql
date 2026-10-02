ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_qualification jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS confirmed_qualification jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS qualification_revision integer NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversation_id text;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS qualified_at timestamptz;
ALTER TABLE conversion_deliveries ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'mock';

CREATE TABLE IF NOT EXISTS inbox_messages (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  lead_id text NOT NULL REFERENCES leads(id),
  event_id text NOT NULL,
  conversation_id text NOT NULL,
  channel text NOT NULL,
  display_name text NOT NULL,
  message_ciphertext text NOT NULL,
  message_hash text NOT NULL,
  is_test boolean NOT NULL,
  occurred_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  analysis jsonb,
  model_provider text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,event_id)
);
CREATE INDEX IF NOT EXISTS inbox_messages_pending_idx ON inbox_messages(status,created_at);
