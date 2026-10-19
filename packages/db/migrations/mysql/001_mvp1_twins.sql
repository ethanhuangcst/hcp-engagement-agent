-- MVP-1: Twin / Insights primary store（MySQL，ADR-005）
-- 幂等：CREATE TABLE IF NOT EXISTS；索引内联（已存在表时整句跳过）
CREATE TABLE IF NOT EXISTS hcp_twins (
  hcp_id         VARCHAR(255) NOT NULL,
  identity       JSON NOT NULL,
  twin           JSON NOT NULL,
  tags           JSON NULL,
  as_of          DATE NULL,
  twin_version   INT NOT NULL DEFAULT 1,
  schema_version VARCHAR(64) NOT NULL DEFAULT '0.1.5-p0',
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (hcp_id),
  KEY idx_hcp_twins_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hcp_insights (
  hcp_id     VARCHAR(255) NOT NULL,
  payload    JSON NOT NULL,
  as_of      DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (hcp_id),
  CONSTRAINT fk_hcp_insights_twin FOREIGN KEY (hcp_id) REFERENCES hcp_twins (hcp_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
