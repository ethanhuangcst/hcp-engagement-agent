# HCP Engagement Assistant

Monorepo：Next.js Web（BFF）+ `hcp-twin-mcp` + Postgres（香港）+ RAG/Agent。

## 本地启动（产品路径 = live）

| 包 | 说明 |
|----|------|
| `@hca/domain` | Twin / Insights / AuthorIds / tags / MCP_ERROR Zod |
| `@hca/db` | Postgres 客户端与 `hcp_twins` / `hcp_insights` 迁移 |
| `@hca/hcp-twin-mcp` | Tools：resolve / confirm / `build_twin` / `get_twin_status` / heatmap… |
| `@hca/mcp-client` | BFF → MCP Streamable HTTP |
| `@hca/web` | Twin 工作台（身份 CRUD + 情报构建进度） |

```bash
cp .env.example .env   # 填 DATABASE_URL；保持 TWIN_MODE=live
npm install
npm run db:migrate

# 产品 MCP（live，外网 OpenAlex 等）
MCP_TRANSPORT=http npm run dev:hcp-twin-mcp
# → http://127.0.0.1:3200/mcp · GET /health（twin_mode=live）

# Web BFF
npm run dev:web
```

`TWIN_MODE=mock` **仅 CI**：须同时设 `ALLOW_TWIN_MOCK=1`（或 Vitest）。裸 mock 会被进程拒绝并回落 live，避免 MVP-1 产品路径误用 fixture。

```bash
# CI / 契约测试
ALLOW_TWIN_MOCK=1 TWIN_MODE=mock npm test -w @hca/hcp-twin-mcp
npm run typecheck
```

`resolve_hcp_identity` **不**写入完整 Twin；确认保存走 `confirm_and_save_twin`。情报构建走详情页「构建情报」→ `build_twin`（MVP-1）。

规格：`specs/mcp/mcp-function-spec.md` · `specs/app/app-function-spec.md` · DoD：`specs/7.test-strategy.md`。
