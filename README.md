# HCP Engagement Assistant

Monorepo：Next.js Web（后续）+ `hcp-twin-mcp` + Postgres（香港）+ RAG/Agent。

## MVP-1 MCP（本阶段）

| 包 | 说明 |
|----|------|
| `@hca/domain` | Twin / Insights / AuthorIds / tags / MCP_ERROR Zod |
| `@hca/db` | Postgres 客户端与 `hcp_twins` / `hcp_insights` 迁移 |
| `@hca/hcp-twin-mcp` | Tools：`resolve_hcp_identity` · `get_twin` · `get_insights` · `tag_hcp` · `health_check` |

```bash
cp .env.example .env   # 填 DATABASE_URL
npm install
npm run db:migrate
TWIN_MODE=mock npm test
npm run typecheck
TWIN_MODE=mock MCP_TRANSPORT=http npm run dev:hcp-twin-mcp
# → http://127.0.0.1:3200/mcp · GET /health
```

`resolve_hcp_identity` **不**写入完整 Twin；BFF「确认并保存」应调用包内 `confirmAndSaveTwin`（或等价 `upsertTwin`）后再 `get_twin`。

规格：`specs/mcp/mcp-function-spec.md` · DoD：`specs/7.test-strategy.md` §6。
