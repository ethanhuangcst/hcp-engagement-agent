-- MVP-4: Engagement Options + Chat sessions
CREATE TABLE IF NOT EXISTS engagement_options (
  run_id        TEXT PRIMARY KEY,
  hcp_id        TEXT NOT NULL REFERENCES hcp_twins(hcp_id) ON DELETE CASCADE,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  as_of         DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_options_hcp
  ON engagement_options (hcp_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id    TEXT PRIMARY KEY,
  hcp_id        TEXT NOT NULL REFERENCES hcp_twins(hcp_id) ON DELETE CASCADE,
  mode          TEXT NOT NULL CHECK (mode IN ('open_chat', 'revise_options')),
  option_run_id TEXT,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  as_of         DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_hcp_mode
  ON chat_sessions (hcp_id, mode, updated_at DESC);
