-- MVP-1: Twin / Insights primary store (MySQL)
CREATE TABLE IF NOT EXISTS hcp_twins (
  hcp_id         VARCHAR(191) PRIMARY KEY,
  identity       JSON NOT NULL,
  twin           JSON NOT NULL,
  tags           JSON NULL,
  as_of          DATE NULL,
  twin_version   INT NOT NULL DEFAULT 1,
  schema_version VARCHAR(64) NOT NULL DEFAULT '0.1.5-p0',
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_hcp_twins_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hcp_insights (
  hcp_id     VARCHAR(191) PRIMARY KEY,
  payload    JSON NOT NULL,
  as_of      DATE NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_hcp_insights_twin
    FOREIGN KEY (hcp_id) REFERENCES hcp_twins(hcp_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
