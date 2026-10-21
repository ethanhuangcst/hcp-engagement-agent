# 1021 上线手册（mvp4 → 生产）

> 目标：把 `mvp4`（Sprint 1+2 成果：对外 MCP、TWIN2 定时刷新、28 学科学术种子、MySQL 方言修复）安全发布到野草云3 节点 Portainer Stack `hcp-engagement-agent`。
> 对比差异见 [env-changes.md](./env-changes.md)；密钥清单见 `specs/.secrets`（不外链，gitignored）。
> 基线快照（2026-10-21 实测）：生产跑 `main@03bd588 / latest`，3 容器，Web/MCP 正常，**生产 Qdrant 空**。
> 停机窗口：不需要（滚动 recreate）；RAG 灌种在生产 Qdrant 上是新写数据，无覆盖风险。

## 阻塞项（开始前必须清零）

| # | 阻塞项 | 处置 | 状态 |
| --- | --- | --- | --- |
| B1 | 46 文件未提交（hcp-engagement-mcp 服务、EMC 测试、medical-kb coverage 等） | Phase 0.1 提交到 mvp4 |  |
| B2 | `mvp4` 缺 docker / compose / CI 三件套（只在 main 有） | Phase 0.2 合 main 进 mvp4 |  |
| B3 | 无 `hcp-engagement-mcp` 镜像：无 Dockerfile、无 compose 服务、CI matrix 只有 2 镜像 | Phase 0.3 新增三处 |  |
| B4 | 生产 Qdrant collections 为空（manifest 与向量脱节） | Phase 3 隧道灌种 |  |

已知不阻塞：DEF-004（Qdrant scroll offset 分页在并发写时可能 panic）未修复——灌种窗口内无并发写，`retrieve` 只读触发不了；列入已知问题，随 MKB2-04 修复。DEF-003 已在 `aedfc1b` 修复（`academicPointId` 含 specialty）。

---

## Phase 0 — 清障与发布提交（本机，不动生产）

### 0.1 提交工作区

1. 本机终端，工作目录 `/Users/ethanhuang/code/hcp-engagement-agent`，确认分支：
   ```bash
   git branch --show-current        # 期望 mvp4
   git status --short | wc -l        # 期望 ~48（46 源/规格文件 + qdrant 日志）
   ```
2. 排除本机运行痕迹（不提交）：
   ```bash
   printf '\n# local qdrant run logs\ndata/qdrant*.log\n' >> .gitignore
   git add .gitignore
   ```
3. 分主题提交（示例切分，可合并但不要漏）：
   ```bash
   git add packages/medical-kb packages/hcp-twin-mcp packages/db data/rag/corpus
   git commit -m "MKB2: compliance coverage signal + academic corpus refresh (feature-09 WIP state)"
   git add packages/hcp-engagement-mcp packages/mcp-client packages/hcp-engagement-agent apps/web specs/
   git commit -m "MCP2: engagement MCP server, display/query formats, web confirm prefetch, specs"
   git status --short      # 期望 qdrant*.log 之外为空
   ```
   注意：`apps/web/src/lib/rag-ingest.ts` 与 twin 流程文件必须包含；`specs/` 的 process 文件草稿（sprint-backlog DEF 引用、status.md）此时一并带走，避免上线后漂移。

### 0.2 从 main 合入部署三件套

```bash
git fetch origin
git merge origin/main --no-edit --no-verify  # 只为拿 docker/ + docker-compose.yml + .github/
```
- 合并冲突预期仅 `.env.example` / `package.json`：`.env.example` 保留 mvp4 版（已是超集）；`package.json` 保留 mvp4 scripts。
- 合后自查三件套存在：`ls docker/ docker-compose.yml .github/workflows/docker-build.yml`。

### 0.3 新增第 4 服务：镜像 + compose + CI

1. **Dockerfile**（新建 `docker/Dockerfile.mcp2`，逐行对齐 `docker/Dockerfile.mcp` 的两段式模式，`node:22-bookworm-slim` + `npm ci --ignore-scripts` + npmmirror）：
   - build 阶段 COPY 根 `package.json`/`package-lock.json` + 下列各包 `package.json`（lockfile 要求路径齐）：`packages/{domain,db,mcp-client,medical-kb,hcp-engagement-agent,hcp-engagement-mcp}`。
   - 执行 `npm run build -w @hca/domain -w @hca/db -w @hca/mcp-client -w @hca/medical-kb -w @hca/hcp-engagement-agent -w @hca/hcp-engagement-mcp && npm prune --omit=dev`。
   - runner 阶段从 build 拷 `node_modules` + 上列六个 `packages/*`（若 `@hca/medical-kb` 运行时读 fixtures，连同 `packages/medical-kb/fixtures` 与其 `data/` 相对路径保持在工作目录；默认种子数据在生产 Qdrant 已有，镜像内不带 `data/rag/corpus`）。
   - 收尾：
     ```dockerfile
     ENV NODE_ENV=production MCP_TRANSPORT=http
     EXPOSE 3300
     CMD ["node", "packages/hcp-engagement-mcp/dist/cli.js"]
     ```
   依据：入口 `packages/hcp-engagement-mcp/src/cli.ts` → `startHttp(port)`，port 取 `MCP2_PORT ?? 3300`（`transport.ts:7`），路径 `/mcp` + `GET /health`。
2. **compose 服务**（`docker-compose.yml` 增，模式照抄既有 `hcp-twin-mcp`：`x-ghcr` anchor `pull_policy: always`、`stack.env`、`./data:/data` bind mount、fetch 探针 healthcheck）：
   ```yaml
   hcp-engagement-mcp:
     <<: *ghcr
     image: ghcr.io/ethanhuangcst/hcp-engagement-agent/hcp-engagement-mcp:${IMAGE_TAG:-latest}
     restart: unless-stopped
     env_file:
       - stack.env
     environment:
       DATABASE_URL: ${DATABASE_URL}
       QDRANT_URL: http://qdrant:6333
       DASHSCOPE_API_KEY: ${DASHSCOPE_API_KEY}
       DASHSCOPE_BASE_URL: ${DASHSCOPE_BASE_URL:-https://dashscope.aliyuncs.com/compatible-mode/v1}
       LLM_MODEL: ${LLM_MODEL:-qwen-max}
       VECTOR_BACKEND: qdrant-local
       MCP_TRANSPORT: http
       MCP2_PORT: "3300"
       HCA_DATA_DIR: /data
     volumes:
       - ./data:/data
     ports:
       - "127.0.0.1:3205:3300"   # loopback-only（同 qdrant 模式）；3204 已被占用实测改 3205。外部访问留待 NPM/代理 story，不直接对公网开
     depends_on:
       qdrant:
         condition: service_started
     healthcheck:
       test:
         [
           "CMD-SHELL",
           "node -e \"fetch('http://127.0.0.1:3300/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"",
         ]
       interval: 15s
       timeout: 5s
       retries: 10
       start_period: 20s
   ```
3. **CI**（`.github/workflows/docker-build.yml`）strategy.matrix.include 增一项（键名是 `image`/`dockerfile`/`context`，与既有两项一致；`metadata-action` 自动产出 `sha-*` 与 `latest` tag，无需改 tags 段）：
   ```yaml
   - image: hcp-engagement-mcp
     dockerfile: docker/Dockerfile.mcp2
     context: .
   ```
4. 本机验证 build 通过再推：
```bash
npm run build -w @hca/hcp-engagement-mcp   # 或 npm run build -w @hca/... 全 workspace；确认 dist/cli.js 产出
docker build -f docker/Dockerfile.mcp2 -t hcp-engagement-mcp:local .   # 平台若为 arm64 注意 --platform linux/amd64
```
5. 关键决定：**是否将 web 容器对 mcp2 的调用放进本次**——ADR-014（`add_hcp` 预灌走 mcp2）已在 web 侧通过 `MCP2_PORT` 对接，确认 `apps/web` 与 `packages/mcp-client` 引用地址为容器服务名（`http://hcp-engagement-mcp:3300`）而非宿主：`grep -rn "hcp-engagement-mcp\|MCP2_PORT" packages/mcp-client/src apps/web/src | grep -v test`。

### 0.4 合并回 main 触发 CI

```bash
git checkout main && git merge mvp4 --no-verify && git push origin main
# GitHub Actions → docker-build.yml → three images pushed to GHCR
```
- 记录 Actions run 的 commit sha（拼 `sha-<7位>`），后面 Portainer 全部镜像统一用这个 tag（对齐 release.md 的版本纪律，`sha-*` 即端口规则的可追溯锚点）。
- **等待三镜像全部 push 成功**再进 Phase 1（Actions 页面确认，不要猜）。

> 失败处理：CI 红了不要绕过——最常见原因是 Dockerfile.mcp2 的 workspace COPY 清单缺包（lockfile 路径校验失败）或 runtime 阶段漏拷某个 `packages/*`（`Cannot find module '@hca/…'`）；先本机 `docker build` 复现修掉再 push。

## Phase 1 — 生产前预检（SSH 只读）

```bash
SSH="ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password root@38.55.192.140"
# 密码在 specs/.secrets: SSH_PASSWORD
$SSH 'docker ps --format "{{.Names}}\t{{.Status}}" | grep hcp'      # 3 容器 Up
$SSH 'curl -s http://127.0.0.1:3001/api/health'                       # 期望 ok:true
$SSH 'curl -s http://127.0.0.1:6333/collections | head -c 300'        # 期望 {"result":{"collections":[]}}
$SSH 'ss -tlnp | grep -E "3204|3205"'                                # 3204 被占确认，3205 空闲
```
回滚锚点记录（写在手边，不许只存聊天）：
```text
回滚镜像 tag: latest（当前生产实际运行 = main@03bd588 的 push）
生产 DB 表结构: mysql/001–004 已建（六表）——回滚不受影响（旧镜像只读不写这些表也安全）
Qdrant: collections 为空 —— 灌种前状态=可完全回滚；灌种后新增集合（回滚不删，属无害残留）
```

## Phase 2 — 数据库迁移确认（幂等，预期零变化）

```bash
# 本机执行即可（生产 MySQL 可直连），只读验证：
mysql -h 38.55.199.241 -P 3306 -u hca -p hca -e "show tables;"
# 六表齐 → db:migrate 无事可做（CREATE TABLE IF NOT EXISTS 幂等）。执行一次以对齐版本：
QDRANT_ENABLED=false npm run db:migrate
```
预期输出四个 `CREATE TABLE IF NOT EXISTS` 幂等通过，无报错。

## Phase 3 — RAG 种子灌进生产 Qdrant（SSH 隧道，本次核心数据动作）

> **状态：已于 2026-10-21 执行完毕(OGT-5),G1–G3 通过:academic 146 / compliance 23,三面一致,零测试残留。** 上线时本 Phase 只剩 G4 冒烟(并入 Phase 6 S4)。执行细节、绕过的 DEF-005 与隧道窗口风险见 [data-backfill-design.md](./data-backfill-design.md) 执行记录。
> 验收口径以该设计文件为准(146 / 23,不是本机现存量口径)。

灌种**从本机跑**（种子 CLI 进程内自设 `RAG_ACADEMIC_FETCH=pubmed`，语料兜底在 repo 的 `data/rag/corpus/academic/*` 已随提交携带 28 学科 chunks.jsonl），向量写入方向通过隧道指向生产节点 Qdrant。

1. 开隧道（新终端保持运行）：
   ```bash
   ssh -N -L 6334:127.0.0.1:6333 -o PubkeyAuthentication=no -o PreferredAuthentications=password root@38.55.192.140
   # 验证：curl http://127.0.0.1:6334/collections → 空集合
   ```
2. 本机项目根目录，**进程内**指向隧道端口（不改任何 .env 文件；`127.0.0.1` 天然满足 bind_safe 的 loopback 要求）：
   ```bash
   export QDRANT_URL=http://127.0.0.1:6334
   ```
3. 灌合规（分钟级）：
   ```bash
   grep -c "tenant-demo" data/rag/corpus/compliance/*/chunks.jsonl   # 先看测试 tenant 残留量
   npm run seed:compliance -w @hca/medical-kb
   ```
   - 预期：`rdpac/2024-01` + `cn_med_rep/2026-08` 集合建立；`ingest_manifest` 生产库新增/更新 compliance 行。
   - tenant 残留处理：语料 chunks 行内 `tenant_id=tenant-demo` 属本地联调测试点，种子按 corpus 原样入库；灌前若有残留，先在语料里清掉再跑（tenant 隔离只在检索查询侧过滤 `retrieve` 的 `tenant_id` 参数，种子不会自动剔除）。
4. 灌学术（28 学科）。两条路线：
   - 默认（PubMed 首拉，约 30–90 分钟视网络）：CLI 在未设 `RAG_ACADEMIC_FETCH` / `NCBI_API_KEY` 时自动置 `RAG_ACADEMIC_FETCH=pubmed`：
     ```bash
     npm run seed:academic-batch -w @hca/medical-kb
     ```
   - 快路径（repo 语料已随提交携带 28 学科 `chunks.jsonl`，约 2 分钟；`--force` 必需，否则 manifest 已 ready 的学科全部 skip）：
     ```bash
     npm run seed:academic-batch -w @hca/medical-kb -- --force --no-fetch
     ```
   - 失败学科单独补跑：`npm run seed:academic-batch -w @hca/medical-kb -- --force --only=<specialty>`。
   - 空库首次执行会因 seed-compliance 的 health 先于 ensure 而 404 中止（DEF-005）：先手动预建空集合再跑，绕法见 [data-backfill-design.md](./data-backfill-design.md) 执行记录。
   - 嵌入模型本机已缓存（dev 阶段已下过），不重复下载；`NCBI_API_KEY` 可选不设（限速时代码退避重试）。
5. 灌后复核（验收闸门 G1–G3，已于 2026-10-21 执行通过；口径见 [data-backfill-design.md](./data-backfill-design.md)）：
   ```bash
   curl -s http://127.0.0.1:6334/collections | python3 -m json.tool    # 恰好 2 个 collection
   curl -s -X POST http://127.0.0.1:6334/collections/academic_index/points/count -H 'Content-Type: application/json' -d '{"exact":true}'
   # 期望 146（语料 146 条：26 学科 × 5 + kidney_transplant 9 + phage_therapy 7）
   curl -s -X POST http://127.0.0.1:6334/collections/compliance_index/points/count -H 'Content-Type: application/json' -d '{"exact":true}'
   # 期望 23（rdpac 15 + cn_med_rep 8，语料记录数；`wc -l` 会少计末行换行）
   mysql -h 38.55.199.241 -u hca -p hca -e "select index_name, count(*) n, sum(chunk_count) s from ingest_manifest group by index_name;"
   # 期望 academic 28 行合计 146、compliance 2 行合计 23（生产库，不是本地）
   ```
6. 串科缺陷抽检（DEF-003 回归点）可留到 Phase 6 S4 用 MCP 全链路一次完成，隧道阶段只验数量与 manifest 一致即可。

> 回滚：本 Phase 新建的只是 Qdrant collections；节点上 `curl -X DELETE http://127.0.0.1:6333/collections/<name>` 即可清掉；`ingest_manifest` 新行无害保留（旧镜像不读该表，新镜像重灌时按 `doc_id` 幂等覆盖）。

## Phase 4 — Portainer 更新 Stack（唯一生产变更窗口）

1. 登录 Portainer（`specs/.secrets` 的 `PORTAINER_URL` / `PORTAINER_USER` / `PORTAINER_PASSWORD`，无 2FA）。
2. Stacks → `hcp-engagement-agent`（id 12）→ **Editor**。
3. compose 文件替换为 Phase 0.3 定稿版（含第 4 服务 `hcp-engagement-mcp`），或直接粘贴新版全文。
4. **Environment variables** 更新：
   - `IMAGE_TAG` = `sha-<Phase 0.4 的 7 位>`（替换 `latest`）
   - 新增 `MCP2_PORT` = `3300`
   - 按需新增 `TWIN_REFRESH_CRON` = `0 18 * * *`（node-cron 按容器本地时区，镜像默认 UTC：18:00 UTC = 北京 02:00；不设则 TWIN2-01 不启动，功能=1.0）
   - 按需新增 `TWIN_REFRESH_TTL_HOURS` = `24`
   - 保留既有：`DATABASE_URL`（指向生产库）、`MCP_URL=http://hcp-twin-mcp:3200`、`QDRANT_URL=http://qdrant:6333`、`TWIN_MODE=live`、`HCA_DATA_DIR=/data`、`LLM_MODEL=qwen-max`、`DASHSCOPE_*`、拉镜像用的 GHCR 凭据（GITHUB_PAT_PORTAINER_GHCR）。
   - 警告：`QDRANT_URL` 在容器内必须是 `http://qdrant:6333`（compose 网络名），不是隧道端口。
5. 点 **Update the stack** → 勾选 **Re-pull image and redeploy**。
6. 等待 4 容器全部 Up（web、hcp-twin-mcp、hcp-engagement-mcp、qdrant），web 首次重启会下嵌入模型（hf-mirror，~1–2 分钟，属预期）。

## Phase 5 — DNS / NPM（无变更确认）

域名 `hcp.agent-mate.ai` 指向不变、NPM web upstream `hcp-engagement-agent-web-1:3001` 不变。**`hcp-engagement-mcp` 的 3205 不配置 NPM**（ADR-008 决策：Streamable HTTP 只对内网，未来外部代理走 kb-agent 模式）。本 Phase 仅登录 NPM 确认证书照旧即可跳过。

## Phase 6 — 冒烟验证（全链路）

| # | 检查 | 命令 / 操作 | 期望 |
| --- | --- | --- | --- |
| S1 | Web 存活 | `curl https://hcp.agent-mate.ai/api/health` | `ok:true` + twin live |
| S2 | 双人旅程 | Web UI 里任选一位医生走 twin 建档→确认→洞察 | 洞察返回含 LLM 内容（DASHSCOPE 通），确认环节合规链路无报错 |
| S3 | MCP2 进程 | 节点上 `curl http://127.0.0.1:3205/health`（SSH 或 `docker exec hcp-engagement-agent-hcp-engagement-mcp-1 curl -s localhost:3300/health`；宿主端口已 bind 127.0.0.1） | `{"ok":true,"service":"hcp-engagement-mcp"}` |
| S4 | 学术检索含 coverage | 节点上对 `127.0.0.1:3205/mcp` 发 JSON-RPC `tools/call` `retrieve_academic`（王拥军，神经内科关键词如「卒中」；session 建立参照 `initialize` + `mcp-session-id` 头） | 5 chunks ready，specialty 正确无串科（DEF-003 回归点） |
| S5 | add_hcp 全链路（ADR-014 预灌） | MCP2 `tools/call` `add_hcp` 新建一位医生 | twin 建档成功，学术预灌触发并入库（`ingest_manifest` 生产库） |
| S6 | 洞察画风 | `get_hcp_insights`（已有 twin 档案如朱同玉） | 结构完整 |
| S7 | TWIN 直连（旧链路） | 宿主 `:3200` twin MCP `health_check` | 正常（确认旧进程未被新部署破坏） |
| S8 | 定时刷新（若启用） | hcp-twin-mcp 容器日志 `grep -i cron` | 出现 cron 注册行 |
| S9 | 共存应用抽查 | `curl` places-agent / kb-agent 的驻留端口（release.md 记录值） | 均存活，与发布前一致 |

任一 S 失败：见回滚。

## 回滚（全量）

```bash
# 动作 1：Portainer → Stack → IMAGE_TAG 改回 latest → Update + Re-pull
# 动作 2（仅当怀疑数据污染）：SSH 删新增 Qdrant collections
$SSH 'curl -X DELETE http://127.0.0.1:6333/collections/academic_index'
$SSH 'curl -X DELETE http://127.0.0.1:6333/collections/compliance_index'
# MySQL 不回滚：六表结构 released 版需要，旧镜像不会因表存在而坏
# 关隧道
```
预计耗时 < 3 分钟（不含镜像 pull）。

## 红线（对齐 release.md）

- 只操作 Stack `hcp-engagement-agent`（id 12）；**绝不**动 mypoke-trade、kb-agent、places-agent 的 stack。
- 不删 `portainer_network` external network。
- 节点 shell 里只执行本手册命令；上生产前一律先跑只读探针。
- 密钥不进聊天、不进截图、不进 compose 明文（Portainer env / secrets 持有）。

## API/工具面新增清单（对中心 Agent 业主的通告）

本次上线后，MCP2 **不对公网暴露**（compose 端口 bind `127.0.0.1:3205:3300`，与 qdrant 同模式），触达方式按优先级：
- 容器网络内（web / 未来代理容器）：`http://hcp-engagement-mcp:3300/mcp`
- 节点 loopback（运维 / 冒烟）：`http://127.0.0.1:3205/mcp`，另有 `GET /health`
- 跨机（中心 Agent 临时联调）：`ssh -L 6334:127.0.0.1:3205 root@38.55.192.140` 之类隧道；公网 TLS 入口属后续 NPM 代理 story（不在 1021 范围）。
- 5 个 MCP 工具：`list_hcp` `query_hcp` `add_hcp` `get_hcp_insights` `retrieve_academic`（合规检索不经 MCP 暴露，走 web 确认链路内部调用）。

## 附录 A：时间线估算

| Phase | 耗时 |
| --- | --- |
| 0 清障+提交+合 main+CI | 40–60 min（CI 20 min） |
| 1–2 预检/DB | 5 min |
| 3 灌种 | 30–90 min（PubMed 首拉为主） |
| 4 Portainer | 10 min（含嵌入模型预热 2 min） |
| 5 无动作 | 0 |
| 6 冒烟 | 15–20 min |
| 合计 | ≈ 2–3 小时 |