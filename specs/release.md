# 发布 — HCP Engagement Assistant

> **Purpose**：本地如何启动、发布前检查与回滚要点。不写真实主机名、密钥或客户环境名。  
> **架构**：[spec1.0/3.architecture.md](./spec1.0/3.architecture.md) · **依赖**：[spec1.0/4.install-dependencies.md](./spec1.0/4.install-dependencies.md)

| 文档 | 作用 |
| --- | --- |
| [3.architecture.md](./spec1.0/3.architecture.md) | 分层、服务与数据流 |
| [release.md](./release.md) | 本地启动、smoke、发布检查 |
| [product-backlog.md](./product-backlog.md) | 2.0 能力与 MCP 工具契约 |

## 1. 本地开发

1. `npm ci`（或 `npm install`）于仓库根目录。
2. 复制 `.env.example` → `.env`，填写 `DATABASE_URL`、`DASHSCOPE_API_KEY` 等（勿提交 `.env`）。
3. `npm run build`（workspace 包需 `dist/`）。
4. `npm run db:migrate`（指向目标库，如 `hca`）。
5. 依赖服务（按需）：
   - Web：`npm run dev:web`（默认端口见 `apps/web`）
   - 对内 MCP：`npm run dev:hcp-twin-mcp`（构建情报需）
   - Qdrant：`npm run start:qdrant`；合规种子：`npm run rag:seed-compliance`
6. Smoke：打开 Web 列表；`GET /api/health` 返回正常；可选 `agent:synthesize-zhu` 验证 LLM 链。

对外 MCP 2.0 进程就绪后，在本节追加启动命令与 Cursor MCP 配置片段（Sprint 1 `task-01` Done 时更新）。

## 2. 发布前检查

| 工件 | Required | 说明 |
| --- | --- | --- |
| `npm run build` | yes | 全 workspace 构建 |
| `npm run test` | yes | 默认 fixture/mock |
| `npm run typecheck` | yes | 若 workspace 已配置 |
| 生产容器 / compose | TBD | 当前以本地 monorepo 为主 |
| Env 模板 | yes | `.env.example`；生产用独立 secret 存储 |

## 3. Smoke（MVP-4 / 2.0）

- Web：列表 → 打开分身 → 洞察 → 一人一策 → 合规检查。
- MCP 2.0（Sprint 1 起）：`list_hcp` → `query_hcp` → `add_hcp` 契约路径（见 [mcp2-stories.md](./mcp2.0/mcp2-stories.md)）。

## 4. 回滚

- 应用：回退部署镜像或上一 git tag；重新 `db:migrate` 仅当迁移可逆或已备回滚脚本。
- 数据：Twin/Options 以 Postgres 为准；回滚前备份 `hcp_twins` 等表（运维流程）。
