# HCP Engagement Assistant

Monorepo：Next.js Web（BFF）+ `hcp-twin-mcp` + MySQL（主库）+ RAG/Agent。

## 一键初始化（推荐）

从空目录或已有 clone：拉代码、经国内镜像装 npm + sharp + Qdrant 二进制、构建、迁移、启动 Qdrant / MCP / Web。

```bash
# 已有仓库
cp .env.example .env   # 填 DATABASE_URL
npm run init           # 或 bash scripts/init.sh

# 空目录首次克隆
bash scripts/init.sh --clone-to ~/code/hcp-engagement-agent
# 克隆后须先编辑 TARGET/.env 中的 DATABASE_URL，再：
cd ~/code/hcp-engagement-agent && npm run init -- --skip-git
```

停止：`npm run stop`。日志：`.run/logs/`。镜像相关环境变量见 `scripts/init.sh` 头部注释。细节与失败分层见 `docs/adr/ADR-003-clean-clone-bootstrap.md`、`specs/4.install-dependencies.md`。

## 本地启动（产品路径 = live）

| 包 | 说明 |
|----|------|
| `@hca/domain` | Twin / Insights / AuthorIds / tags / MCP_ERROR Zod |
| `@hca/db` | MySQL 客户端与 `hcp_twins` / `hcp_insights` 迁移（见 `specs/9.deploy.md`） |
| `@hca/hcp-twin-mcp` | Tools：resolve / confirm / `build_twin` / `get_twin_status` / heatmap… |
| `@hca/mcp-client` | BFF → MCP Streamable HTTP |
| `@hca/web` | Twin 工作台（身份 CRUD + 情报构建进度） |

```bash
cp .env.example .env   # 填 DATABASE_URL；保持 TWIN_MODE=live
npm install
npm run build          # workspace 包导出 dist/，干净 clone 必做
npm run db:migrate

# 终端 1：Qdrant（RAG；镜像下载见 scripts/start-qdrant.sh）
npm run start:qdrant

# 终端 2：产品 MCP（live，外网 OpenAlex 等）
MCP_TRANSPORT=http npm run dev:hcp-twin-mcp
# → http://127.0.0.1:3200/mcp · GET /health（twin_mode=live）

# 终端 3：Web BFF
npm run dev:web
```

`TWIN_MODE=mock` **仅 CI**：须同时设 `ALLOW_TWIN_MOCK=1`（或 Vitest）。裸 mock 会被进程拒绝并回落 live，避免 MVP-1 产品路径误用 fixture。

```bash
# CI / 契约测试
ALLOW_TWIN_MOCK=1 TWIN_MODE=mock npm test -w @hca/hcp-twin-mcp
npm run typecheck
```

`resolve_hcp_identity` **不**写入完整 Twin；确认保存走 `confirm_and_save_twin`。情报构建走详情页「构建情报」→ `build_twin`（MVP-1）。

## Docker Compose（Web + MCP + Qdrant）

MySQL 主库为远程实例（`.env` 的 `DATABASE_URL`），不在 compose 内起库。`web` / `hcp-twin-mcp` **拉取 GHCR 制品**（不本地 `--build`）。

```bash
cp .env.example .env   # 填 DATABASE_URL
# 私有 GHCR：echo $GITHUB_TOKEN | docker login ghcr.io -u USER --password-stdin
docker compose pull && docker compose up -d
# Web http://127.0.0.1:3001 · MCP :3200/health · Qdrant 仅 127.0.0.1:6333
# 可选：IMAGE_TAG=sha-… 或 semver
docker compose logs -f web hcp-twin-mcp
docker compose down
```

CI 构建推送：[`.github/workflows/docker-build.yml`](.github/workflows/docker-build.yml) → `ghcr.io/ethanhuangcst/hcp-engagement-agent/{web,hcp-twin-mcp}`。部署细节见 [`specs/9.deploy.md`](specs/9.deploy.md)。

规格：`specs/mcp/mcp-function-spec.md` · `specs/app/app-function-spec.md` · DoD：`specs/7.test-strategy.md`。
