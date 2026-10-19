-- MVP-4: RAG ingest manifest + jobs（MySQL，ADR-005）
CREATE TABLE IF NOT EXISTS ingest_manifest (
  doc_id      VARCHAR(255) NOT NULL,
  index_name  VARCHAR(255) NOT NULL,
  specialty   VARCHAR(255) NULL,
  version     VARCHAR(64) NOT NULL,
  as_of       DATE NULL,
  corpus_path TEXT NULL,
  chunk_count INT NOT NULL DEFAULT 0,
  authority   VARCHAR(255) NULL,
  metadata    JSON NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (doc_id),
  KEY idx_ingest_manifest_index (index_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rag_ingest_jobs (
  job_id     VARCHAR(255) NOT NULL,
  specialty  VARCHAR(255) NULL,
  hcp_id     VARCHAR(255) NULL,
  status     VARCHAR(64) NOT NULL,
  progress   DOUBLE NULL,
  error      JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (job_id),
  KEY idx_rag_jobs_specialty (specialty)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
