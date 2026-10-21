# 环境与工作区差异 — 1021 上线（对比上一次上线工作区）

> 对比基线：**上一次上线** = `main` @ `03bd588`（Merge PR #3），生产运行 `IMAGE_TAG=latest`（2026-10-19 核对，容器 Up 3 天实测 —— 仍是该批镜像）。
> 本次发布工作区：`mvp4` 分支 HEAD `aedfc1b` + 46 个未提交文件（约 +1398 行，须先提交）。
> 核对方式：`git diff main..mvp4` + 工作区 diff + 2026-10-21 SSH 实机只读核对（野草云3）+ 生产 MySQL 只读核对。
> 密钥：本次**不引入新密钥**；核对结论见 [specs/.secrets](../../.secrets)（gitignored）。

---

## 1. 最大差异（按影响排序）

### 1.1 服务拓扑：新增对外 MCP 进程 `hcp-engagement-mcp`

- `main`（上次上线）：web + hcp-twin-mcp + qdrant 三服务。
- 本次：新增第 4 个服务 `hcp-engagement-mcp`（容器端口 `3300`，Streamable HTTP，ADR-008）。
- **仓库缺口（阻塞项）**：`mvp4` 分支缺 `docker-compose.yml`、`docker/`、`.github/workflows/`（只在 `main` 有）；且 `main` 的 compose 与 CI 均无 mcp2 服务，须本次新增（Dockerfile + compose service + CI matrix）。
- **宿主端口**：release.md 曾建议 `3204→3300`，但 2026-10-21 实机核对 `3204` 已被占用；本次改用 **`3205→3300`**（节点监听清单：3200–3204 均 occupied）。

### 1.2 数据面：生产 Qdrant 是空的，元数据与向量不同步（本次最重要的数据差异）

- 2026-10-21 SSH 实测生产节点 Qdrant（`127.0.0.1:6333` → 容器 `/qdrant/storage`，bind `/data/compose/12/data/qdrant`）：**collections 为空**，`academic_index` / `compliance_index` 均不存在。
- 生产 MySQL（`38.55.199.241:3306/hca`）却有种子元数据：`ingest_manifest` 28 行（academic）+ 2 行（compliance），`rag_ingest_jobs` 182 行。
- 根因：本地开发共享生产 MySQL，但向量写的是**本地** Qdrant（同为 `127.0.0.1:6333`）。manifest 说 ready，线上向量实为空。上次上线（main 时代）从未在生产灌过 RAG 种子。
- 结论：**本次上线必须把种子经 SSH 隧道灌进节点 Qdrant**（`seed_compliance` + `seed:academic-batch`），否则 MCP 检索在生产返回空。方案与验收口径见 [data-backfill-design.md](./data-backfill-design.md)（OGT-5）；步骤见 [go-live-instruction.md](./go-live-instruction.md) Phase 3。

### 1.3 镜像与 CI

- 上次：2 个 GHCR 镜像（web ~428MB、hcp-twin-mcp ~1.19GB）。
- 本次：**3 个图像**（+ `hcp-engagement-mcp`）；CI `docker-build.yml` matrix 须从 2 项扩为 3 项，且该工作流文件本身要先从 `main` 合入 `mvp4`。

### 1.4 数据库

- 迁移脚本已切 MySQL 方言：`db:migrate` 现执行 `packages/db/migrations/mysql/001–004`（`CREATE TABLE IF NOT EXISTS`，幂等）。
- 生产 MySQL 只读核对（2026-10-21）：六表**全部已存在**（`hcp_twins`、`hcp_insights`、`ingest_manifest`、`rag_ingest_jobs`、`engagement_options`、`chat_sessions`）。
- 风险变化：SQL 方言修复（DEF-002，feature-06 已 Done）——上线后 `ingest_manifest` / `rag_ingest_jobs` 读写才真正可用（旧镜像写的是 Postgres 方言，在线上从未成功跑通过 RAG 灌注）。

## 2. 环境变量差异

### 2.1 Portainer Stack env（节点层，本次需要动作）

| 变量 | 上次上线 | 本次 | 动作 |
| --- | --- | --- | --- |
| `IMAGE_TAG` | `latest`（main 构建） | 新 GHCR tag（建议 `sha-*`，来自 mvp4 合并后的 main push） | 更新 |
| `DATABASE_URL` | 同 | 同（`mysql://…@38.55.199.241:3306/hca`） | 不变 |
| `MCP_URL` / `MCP_TRANSPORT` / `MCP_PORT` | 同 | 同（`http://hcp-twin-mcp:3200`） | 不变 |
| `TWIN_MODE` | `live` | `live` | 不变 |
| `QDRANT_URL` | `http://qdrant:6333` | 同 | 不变 |
| `HCA_DATA_DIR` | `/data` | 同 | 不变 |
| `MCP2_PORT` | 无 | **新增**：`3300`（代码默认即 3300；compose 服务需要） | 新增 |
| `TWIN_REFRESH_CRON` | 无 | **可选**：设如 `"0 2 * * *"` 开启 TWIN2-01 定时刷新；不设 = 关闭（1.0 行为） | 按需 |
| `TWIN_REFRESH_TTL_HOURS` | 无 | **可选**：默认 24 | 按需 |
| `RERANK_DISABLE` | 建议带 | 建议保持 `true`（生产省一次 cross-encoder 下载） | 建议带 |
| `HF_ENDPOINT` / `TRANSFORMERS_REMOTE_HOST` / `EMBEDDING_MODEL` | 建议带 | 建议保持（容器重启后首次检索要下嵌入模型，走 hf-mirror） | 建议带 |

### 2.2 仓库 `.env.example`（模板层差异，不直接影响节点）

| 差异 | 说明 |
| --- | --- |
| 新增 `MCP2_PORT` / `TWIN_REFRESH_CRON` / `TWIN_REFRESH_TTL_HOURS` 注释段 | 2.0 变量落模板 |
| 新增 `PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright` | 仅开发机装浏览器用，非生产变量 |
| 模板口径从「copy to `.env`」改为 `.env.local` | OGT-1：`loadRootEnv` 收敛读根 `.env.local` |
| 移除 `MYSQL_CONNECT_TIMEOUT_MS` 注释 | 代码默认仍在，模板删注释 |
| `LLM_MODEL` 示例仍是 `qwen-plus` | 生产实际 `qwen-max`（.secrets 为准），示例即注释无需改节点 |

### 2.3 密钥

- 本次**不需要新密钥**；SSH / Portainer / NPM / MySQL / DASHSCOPE / GHCR PAT 全部沿用 `specs/.secrets` 现值（核对记录见该文件 2026-10-21 段）。

## 3. 代码与语料差异（影响生产行为）

| 层 | 上次上线（main） | 本次 |
| --- | --- | --- |
| 对外 MCP 工具 | 无此进程 | 5 工具：`list_hcp` / `query_hcp` / `add_hcp` / `get_hcp_insights` / `retrieve_academic`（带 coverage；合规检索不经 MCP 暴露，走 web 确认链路） |
| 定时刷新 | 无 | TWIN2-01（node-cron，env 可关） |
| 学术种子 | 3 专科 fixture | 28 临床一级学科；`academicPointId` 已含 specialty（DEF-003 修复在 `aedfc1b`） |
| 合规种子 | `rdpac/2024-01` + `cn_med_rep/2026-08` 初版 | 条款语料有扩充/修订（工作区 `M`，含 tenant-demo 为本地测试点） |
| Web 确认后预灌 | F-WEB-039（writing ingest） | 同链路 + `add_hcp` 预灌对齐（ADR-014） |
| DB 访问 | mysql2 已切（main d5dd27c） | + 元数据层 MySQL 方言修复（DEF-002） |

## 4. 未提交工作区清单（提交前必须处置）

- 46 文件 ~+1398 行未提交（含 hcp-engagement-mcp 服务器实现、EMC tests、medical-kb coverage 改动）。
- 未跟踪源码：`packages/hcp-engagement-mcp/src/{mcp-display,query-hcp-format}.{ts,test.ts}`、`packages/medical-kb/src/{compliance-coverage.ts,compliance.test.ts}`。
- 未跟踪日志：`data/qdrant.log`、`data/qdrant-recover.log`（不提交，属本机运行痕迹）。
- 结论：全部源码改动须进发布提交；日志文件不提交（建议加 .gitignore 或保持不动）。

## 5. 生产现状基线（核对快照，2026-10-21）

| 项 | 实测值 |
| --- | --- |
| Web | `https://hcp.agent-mate.ai` 正常，`/api/health` `{"ok":true,"database_ok":true,"mcp":{"ok":true,"twin_mode":"live","version":"0.2.0"}}` |
| 容器 | `hcp-engagement-agent-{web,hcp-twin-mcp,qdrant}-1`，Up 3 days |
| 节点已占用监听端口 | 22 53 80 81 443 3001 3002 3003 3006 3007 3008 3200 3201 3202 3203 **3204** 6333(loopback) 6335 6336 8000 9443 9649 |
| 生产 Qdrant collections | **空**（academic/compliance 均不存在） |
| 生产 MySQL 表 | 六表齐；`rag_ingest_jobs`=182 行、`ingest_manifest` 28+2 行 |