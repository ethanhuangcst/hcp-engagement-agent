-- 通用 open_chat 工作区占位 Twin（满足 chat_sessions.hcp_id FK；非真实 HCP）
INSERT INTO hcp_twins (hcp_id, identity, twin, tags, as_of, twin_version, schema_version, updated_at)
VALUES (
  '_agent_general',
  '{"name_zh":"通用工作区","hospital":"—","department":"—"}'::jsonb,
  '{
    "meta": {
      "schema_version": "0.1.5-p0",
      "hcp_id": "_agent_general",
      "as_of": "2026-07-18",
      "twin_version": 0
    },
    "identity": {
      "name_zh": "通用工作区",
      "hospital": "—",
      "department": "—"
    },
    "profile": {
      "name_zh": "通用工作区",
      "hospital": "—",
      "department": "—",
      "disambiguation_status": "unresolved",
      "specialties": []
    }
  }'::jsonb,
  NULL,
  '2026-07-18'::date,
  0,
  '0.1.5-p0',
  NOW()
)
ON CONFLICT (hcp_id) DO NOTHING;
