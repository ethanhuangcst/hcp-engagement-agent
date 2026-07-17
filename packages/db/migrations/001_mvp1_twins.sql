-- MVP-1: Twin / Insights primary store (Hong Kong Postgres)
CREATE TABLE IF NOT EXISTS hcp_twins (
  hcp_id        TEXT PRIMARY KEY,
  identity      JSONB NOT NULL DEFAULT '{}'::jsonb,
  twin          JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags          JSONB,
  as_of         DATE,
  twin_version  INTEGER NOT NULL DEFAULT 1,
  schema_version TEXT NOT NULL DEFAULT '0.1.5-p0',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hcp_insights (
  hcp_id        TEXT PRIMARY KEY REFERENCES hcp_twins(hcp_id) ON DELETE CASCADE,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  as_of         DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hcp_twins_updated_at ON hcp_twins (updated_at DESC);
