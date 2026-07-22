-- MVP-4: RAG ingest manifest + jobs (Hong Kong Postgres)
CREATE TABLE IF NOT EXISTS ingest_manifest (
  doc_id        TEXT PRIMARY KEY,
  index_name    TEXT NOT NULL,
  specialty     TEXT,
  version       TEXT NOT NULL,
  as_of         DATE,
  corpus_path   TEXT,
  chunk_count   INTEGER NOT NULL DEFAULT 0,
  authority     TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rag_ingest_jobs (
  job_id        TEXT PRIMARY KEY,
  specialty     TEXT,
  hcp_id        TEXT,
  status        TEXT NOT NULL,
  progress      REAL,
  error         JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingest_manifest_index ON ingest_manifest (index_name);
CREATE INDEX IF NOT EXISTS idx_rag_jobs_specialty ON rag_ingest_jobs (specialty);
