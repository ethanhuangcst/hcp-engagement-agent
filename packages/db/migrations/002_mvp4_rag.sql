-- MVP-4: RAG ingest manifest + jobs (MySQL)
CREATE TABLE IF NOT EXISTS ingest_manifest (
  doc_id      VARCHAR(191) PRIMARY KEY,
  index_name  VARCHAR(128) NOT NULL,
  specialty   VARCHAR(191) NULL,
  version     VARCHAR(128) NOT NULL,
  as_of       DATE NULL,
  corpus_path TEXT NULL,
  chunk_count INT NOT NULL DEFAULT 0,
  authority   VARCHAR(191) NULL,
  metadata    JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_ingest_manifest_index (index_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rag_ingest_jobs (
  job_id     VARCHAR(191) PRIMARY KEY,
  specialty  VARCHAR(191) NULL,
  hcp_id     VARCHAR(191) NULL,
  status     VARCHAR(64) NOT NULL,
  progress   DOUBLE NULL,
  error      JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_rag_jobs_specialty (specialty)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
