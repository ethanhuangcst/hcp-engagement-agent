-- MVP-4: Engagement Options + Chat sessions (MySQL)
CREATE TABLE IF NOT EXISTS engagement_options (
  run_id     VARCHAR(191) PRIMARY KEY,
  hcp_id     VARCHAR(191) NOT NULL,
  payload    JSON NOT NULL,
  as_of      DATE NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_engagement_options_hcp (hcp_id, updated_at),
  CONSTRAINT fk_engagement_options_twin
    FOREIGN KEY (hcp_id) REFERENCES hcp_twins(hcp_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id    VARCHAR(191) PRIMARY KEY,
  hcp_id        VARCHAR(191) NOT NULL,
  mode          VARCHAR(32) NOT NULL,
  option_run_id VARCHAR(191) NULL,
  payload       JSON NOT NULL,
  as_of         DATE NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_chat_sessions_hcp_mode (hcp_id, mode, updated_at),
  CONSTRAINT chk_chat_sessions_mode
    CHECK (mode IN ('open_chat', 'revise_options')),
  CONSTRAINT fk_chat_sessions_twin
    FOREIGN KEY (hcp_id) REFERENCES hcp_twins(hcp_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
