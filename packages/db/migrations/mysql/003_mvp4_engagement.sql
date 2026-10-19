-- MVP-4: Engagement Options + Chat sessions（MySQL，ADR-005）
CREATE TABLE IF NOT EXISTS engagement_options (
  run_id     VARCHAR(255) NOT NULL,
  hcp_id     VARCHAR(255) NOT NULL,
  payload    JSON NOT NULL,
  as_of      DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (run_id),
  KEY idx_engagement_options_hcp (hcp_id, updated_at),
  CONSTRAINT fk_engagement_options_twin FOREIGN KEY (hcp_id) REFERENCES hcp_twins (hcp_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id    VARCHAR(255) NOT NULL,
  hcp_id        VARCHAR(255) NOT NULL,
  mode          VARCHAR(32) NOT NULL,
  option_run_id VARCHAR(255) NULL,
  payload       JSON NOT NULL,
  as_of         DATE NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id),
  KEY idx_chat_sessions_hcp_mode (hcp_id, mode, updated_at),
  CONSTRAINT fk_chat_sessions_twin FOREIGN KEY (hcp_id) REFERENCES hcp_twins (hcp_id) ON DELETE CASCADE,
  CONSTRAINT chk_chat_sessions_mode CHECK (mode IN ('open_chat', 'revise_options'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
