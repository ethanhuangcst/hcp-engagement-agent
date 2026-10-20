# HCP Engagement Assistant 2.0 — 升级与重构技术架构

> as_of：2026-10-19
> 范围：对外 MCP 2.0（六工具）+ TWIN2-01 定时刷新 + AGT2-01 ROCKS Agent 优化。
> 需求与工具契约：[product-backlog.md](./product-backlog.md#external-service)
> 1.0 架构：[spec1.0/3.architecture.md](./spec1.0/3.architecture.md)
> 对外 MCP 需求侧：[mcp2.0/mcp2-design.md](./mcp2.0/mcp2-design.md) · [mcp2.0/mcp2-stories.md](./mcp2.0/mcp2-stories.md) · [mcp2.0/mcp2-test.md](./mcp2.0/mcp2-test.md)
> Sprint 排期：[sprint-backlog.md](./sprint-backlog.md)

---

## 1. 文档定位

本文是 2.0 升级与重构的权威架构与详细技术设计。1.0 架构文档继续有效；本文只写 2.0 引入的增量，与 1.0 冲突处以本文为准。

| 文档 | 回答的问题 |
|------|------------|
| `product-backlog.md` | 2.0 做什么、工具契约是什么 |
| **本文 `specs/architecture.md`** | 2.0 系统如何分层、新进程如何设计、六个工具如何落到现有包 |
| `spec1.0/3.architecture.md` | 1.0 五层架构、进程边界、数据流（仍然有效） |
| `mcp2.0/*` | 对外 MCP 的设计要点、用户故事、测试门禁 |

---

## 2. 2.0 目标与非目标

### 2.1 目标

1. **对外 MCP 2.0**：调用方（Cursor / 企业 Agent 宿主）不打开网页，即可完成列表、查询、新增、洞察、一人一策、合规预审六项能力。
2. **TWIN2-01 后台定时刷新**：系统按计划对已保存医生重新采集并写回数字分身与洞察，无需人工触发。
3. **AGT2-01 Agent 优化**：用 ROCKS 范式优化一人一策、开放对话与一句话洞察在真实 LLM 下的输出质量、时延与降级。

### 2.2 非目标（2.0 不做）

| 非目标 | 原因 |
|--------|------|
| 暴露采集能力（resolve / build_twin / collectors） | 产品 DoD：对外入口不提供采集用的内部能力 |
| 对外 MCP 鉴权 | 2.0 仅内网可达，不加鉴权（用户决策，2026-10-19） |
| 正式 MLR 电子签、CRM 回写 | 1.0 起持续非目标 |
| 新存储 / LangGraph / 消息队列 | 现有共享包与 MySQL + Qdrant 已满足约束 |

---

## 3. 逻辑架构（2.0 增量）

1.0 五层不变。2.0 在**决策层旁**新增一条对外通道：

```text
┌─────────────────────────────────────────────────────────────┐
│  表达层   apps/web — Twin / Insights / Options / Assistant   │
├─────────────────────────────────────────────────────────────┤
│  决策层   hcp-engagement-agent ──► hcp-engagement-mcp（新）   │
│           （对内 BFF 调用）      （对外六工具，本设计）        │
├─────────────────────────────────────────────────────────────┤
│  知识层   medical-kb — academic_index ‖ compliance_index     │
├─────────────────────────────────────────────────────────────┤
│  感知层   hcp-twin-mcp — collectors + TWIN2-01 定时刷新（新）  │
├─────────────────────────────────────────────────────────────┤
│  约束层   cn-hcp-compliance + 人审 MLR（不变）                │
└─────────────────────────────────────────────────────────────┘
```

| 变化 | 说明 |
|------|------|
| 新增 `hcp-engagement-mcp` | 对外 MCP 进程，包装现有共享包；不复制 BFF 路由逻辑 |
| 感知层加定时刷新器 | 在 `hcp-twin-mcp` 进程内新增调度器，调用既有 build 管线 |
| 数据面不变 | MySQL 主库（ADR-005）+ Qdrant 向量；`openalex_aliases`（ADR-004）随工具契约暴露 |

---

## 4. 物理架构

```mermaid
flowchart TB
    subgraph caller [外部调用方]
        H[Cursor / 企业 Agent]
    end

    subgraph mcp2 [新进程 packages/hcp-engagement-mcp :3300]
        T[六工具注册 + Zod 校验]
        ERR[统一 MCP_ERROR 映射]
        HEALTH[/health（HTTP 模式）]
    end

    subgraph web [apps/web 进程（不变）]
        BFF[/api/* BFF/]
        AGT1[hcp-engagement-agent]
    end

    subgraph twin [hcp-twin-mcp 进程]
        SRV[对内 MCP Server]
        CRON[TWIN2-01 定时刷新器]
        COLLECT[Collectors]
    end

    subgraph data [数据平面]
        MY[(MySQL 主库)]
        Q[(Qdrant)]
    end

    subgraph external [外部服务]
        LLM[DashScope Qwen]
        OpenAPIs[OpenAlex / ORCID / PubMed / CT.gov]
    end

    H -->|Streamable HTTP :3300| T
    T --> DB2[="@hca/db"]
    T --> AGT2[="@hca/hcp-engagement-agent"]
    AGT2 --> KB[="@hca/medical-kb"]
    DB2 --> MY
    KB --> Q
    AGT2 --> LLM
    BFF --> SRV
    CRON --> COLLECT
    COLLECT --> OpenAPIs
    COLLECT --> MY
```

### 4.1 进程边界（硬规则，2.0 追加）

| 规则 | 说明 |
|------|------|
| 对外 MCP 不依赖 `hcp-twin-mcp` | 六工具经 `@hca/db` / Agent / medical-kb 直达数据；**不**转发到对内 MCP，杜绝采集面外泄 |
| 对外 MCP 不含 Playwright | 与 `apps/web` 同样禁止依赖 `playwright` |
| handler 全薄 | Zod 校验 → 调共享包 → 错误映射；业务逻辑零复制（不复制 BFF 路由逻辑） |
| 刷新不经过对外 MCP | TWIN2-01 在 twin 进程内定时调用 build 管线；对外 MCP 无任何「构建/刷新」工具 |
| 密钥只在进程环境 | `DATABASE_URL`、LLM Key 与 Web 同源 env；tool result 不出现密钥、堆栈、内网路径 |

### 4.2 部署单元（2.0 后）

| 服务 | 端口 | 说明 |
|------|------|------|
| `web` | `:3001` | 不变 |
| `hcp-twin-mcp`（对内） | `:3200` | 不变；新增 TWIN2-01 调度器（env 开关） |
| `hcp-engagement-mcp`（对外，新） | `:3300` | 仅 Streamable HTTP（ADR-008）；仅内网可达 |
| `qdrant` | `:6333`（仅 127.0.0.1） | 不变 |

---

## 5. 对外 MCP 2.0 详细设计

### 5.1 包与进程

| 项 | 设计 |
| --- | --- |
| 包名 | `@hca/hcp-engagement-mcp`（`packages/hcp-engagement-mcp`） |
| 骨架 | 沿用 `packages/hcp-twin-mcp/src/server.ts` 的「逻辑与传输解耦」模式：`tools/`（注册与 handler）、`transport/`（Streamable HTTP）、`errors.ts`（MCP_ERROR 映射） |
| Transport | 仅 Streamable HTTP（ADR-008，stdio 已移除）；监听 `:3300`（`MCP2_PORT` 可覆盖）；日志走 stderr |
| 注册 | 六工具分三 Sprint 落地（S1 三工具、S2 两工具、S3 一工具）；工具一经注册即稳定，参数与返回的扩展须有 ADR 背书（ADR-009 / ADR-010） |
| 配置 | `DATABASE_URL`、LLM/RAG 与 Web 同源 env；无新增密钥 |

### 5.2 六工具契约总表

工具名、入参、返回、Annotations 以 [product-backlog.md「MCP」list](./product-backlog.md#external-service) 为准；下表是落地方。

| 工具 | PBI | Annotations | 读/写 | 主要依赖 | 失败码 |
|------|-----|-------------|-------|----------|--------|
| `query_hcp` | MCP2-01 | `readOnlyHint: true`；`openWorldHint: true` | 读 | `@hca/db` `listTwins` / `getTwin` + 内存过滤；`include_external` → 对内 `resolve_hcp_identity`（HTTP，ADR-010） | `VALIDATION_ERROR` / `NOT_FOUND`；外源失败降级不报错 |
| `list_hcp` | MCP2-06 | `readOnlyHint: true` | 读 | `@hca/db` `listTwins` | `INTERNAL_ERROR` |
| `add_hcp` | MCP2-02 | 写库；非删除；非幂等 | 写 | 候选令牌（进程内 TTL 缓存，ADR-010）→ 共享 `confirmAndSaveTwin`（§5.4；ADR-009 查重） | `VALIDATION_ERROR` / `NOT_FOUND`（令牌无效）/ `INTERNAL_ERROR` |
| `get_hcp_insights` | MCP2-03 | `readOnlyHint: true` | 读 | `@hca/db` `getInsights` + `getTwin` | `NOT_FOUND` |
| `retrieve_academic` | MCP2-04 | `readOnlyHint: true`；`openWorldHint: true` | 读 | `@hca/medical-kb` 学术检索（对齐 I-AGT-007；ADR-012） | `NOT_FOUND` / `INTERNAL_ERROR` |
| `retrieve_compliance` | MCP2-05 | `readOnlyHint: true`；description 声明非预审 | 读 | `@hca/medical-kb` 合规检索（对齐 I-AGT-008；`tenant_id` 来自服务端鉴权上下文，ADR-012） | `NOT_FOUND` / `INTERNAL_ERROR` |

六工具的入参、返回字段与错误语义逐条对应 product-backlog 的 MCP list，此处不重复；差异点见 §5.3–§5.5。

### 5.3 读路径：list / query / insights

- 三个读工具直接调 `@hca/db` 现有函数；**排除 `_agent_general` 占位医生**（`AGENT_GENERAL_HCP_ID`）。
- `list_hcp` 无分页，一次返回全量 `{ count, items[] }`；items 含 `hcp_id`、姓名、医院、科室、`as_of`、标签、一句话洞察摘要（来自 `doing_now.summary`）。
- `query_hcp`：`hcp_id` 与 `name` 至少传一；`hcp_id` 存在时只查这一位（仍放 `items` 数组）；`hospital` / `department` / `city` 为可选叠加过滤（医院/科室为归一相等或包含匹配，ADR-011；城市为归一相等）；多条命中全返回。可选 `include_external`（默认 false）同步检索库外候选并签发 `candidate_id`（ADR-010）；候选与库内同人去重；外源失败降级为仅库内并提示。
- `get_hcp_insights`：返回 `{ twin, insights }`；`insights.doing_now.summary` 为一句话洞察；twin 或 insights 缺失 → `NOT_FOUND`。

### 5.4 写路径 1：add_hcp 与共享 confirm 服务重构

现状：确认保存逻辑在 `apps/web/src/app/api/twins/confirm/route.ts` 路由内。

重构步骤：

1. 抽出共享服务 `confirmAndSaveTwin(input): Promise<{ twin, hcpId }>`，落点 `packages/db/src/confirm.ts`（`@hca/db` 导出）。
2. BFF 路由改为薄调用；行为不变，靠既有契约测试护住回归。
3. `add_hcp` handler 以 `candidate_id` 从令牌缓存换取身份入参后调同一服务（ADR-010）；**不**触发 build。

| 规则 | 说明 |
|------|------|
| `hcp_id` 已存在 | `VALIDATION_ERROR`（不覆盖已有 Twin；更新走 Web 编辑或 TWIN2-01） |
| 同名疑似同人 | 写前按 `query_hcp` 姓名规则查重（`name_zh` 中文精确、`name_en` 拉丁档）；命中且编号不同 → 不写库，返回 `status: "confirmation_required"` 与 `possible_duplicates[]`（医院/科室归一相同者排前）；带 `confirm_not_duplicate: true` 重调写入（[ADR-009](../../docs/adr/ADR-009-add-hcp-duplicate-check.md)） |
| 候选令牌 | 入参 `candidate_id` 必填；令牌不存在 / 过期 / 已用 → `NOT_FOUND`（TTL 默认 30 分钟）；身份字段由缓存中的候选生成（[ADR-010](../../docs/adr/ADR-010-external-resolve-and-candidate-token.md)） |
| 草稿字段 | 候选携带的文献号按 ADR-004 落主 ID + `openalex_aliases` 并镜像 `profile.external_ids`；候选无标签草稿，标签走确认保存默认档 |
| 返回 | 写入成功 `{ twin, hcp_id, knowledge_jobs? }`；疑似同人 `{ status: "confirmation_required", possible_duplicates[] }`；`knowledge_jobs` 仅在学术按需 ingest 被触发时出现，可为空 |

### 5.5 决策面不对外：propose / precheck（ADR-012）

- `propose_engagement_options` 与 `precheck_compliance` **不注册为对外 MCP 工具**：调用方 prompt 可被注入，服务器无法验证其意图与 `product_context` 真实性；方案生成与合规闸门触发仅经服务器内嵌 agent + Web App（[ADR-012](../docs/adr/ADR-012-mcp2-data-plane-only.md)）。
- Agent 包内部五 tool 与包级 API（`proposeOptions`、`runComplianceGate`）不变；`propose` 主路径「`retrieve_compliance` 不可跳过」不受影响；响应仍含固定 disclaimer、不替代正式 MLR。
- 对外新增两个数据面检索工具：`retrieve_academic`（MCP2-04，Sprint 2）与 `retrieve_compliance`（MCP2-05，Sprint 3），对齐 Agent 内部 I-AGT-007 / I-AGT-008；`retrieve_compliance` 返回条款引用（`clause_id` / `authority` / `version`），`tenant_id` 来自服务端鉴权上下文、不作工具入参，租户鉴权未上线前仅返回全局种子。
- 外部本地 agent 可基于数据面工具在本地生成方案草稿并做本地预审：方案含双引用、恒标 `mlr_status: draft_not_reviewed`；预审基于条款引用，标注不替代服务器闸门与正式 MLR；不触发服务器决策面副作用。
- 远程提案若立项：独立 MCP（带鉴权与 tenant 作用域）或 Web App，不复用数据面 MCP。

### 5.6 错误与观测

| 项 | 设计 |
| --- | --- |
| 错误契约 | 复用 `@hca/domain` `MCP_ERROR`；统一 `{ code, message, repair_hint? }`；与 BFF 错误码对齐 |
| 禁止内容 | tool result 与 stderr 协议流不出现密钥、堆栈、内网路径 |
| 健康 | `GET /health`（MySQL 可达 + 配置自检） |
| 指标（后续） | 每 tool 延迟、LLM 调用次数、失败码计数，走 stderr 结构化日志起步 |

---

## 6. TWIN2-01 定时刷新设计

| 项 | 设计 |
| --- | --- |
| 位置 | `hcp-twin-mcp` 进程内新增 `scheduler/`（node-cron），复用既有 Stage A–E build 管线与逐 hcpId 互斥 |
| 开关 | `TWIN_REFRESH_CRON`（如 `"0 2 * * *"`）；未设 = 关闭，行为与 1.0 完全一致 |
| 刷新范围 | 全部已保存医生（`listTwins()`，排除 `_agent_general`）；逐个顺序执行，避免打满外网 API 配额 |
| 跳过规则 | 距上次成功刷新 < `TWIN_REFRESH_TTL_HOURS`（默认 24）的 HCP 跳过 |
| 失败 | 单个 HCP 失败不阻断本轮；记 stderr 结构化日志；Twin 正文保留上次成功版本 |
| 对外暴露 | 无。对外 MCP 不提供手动更新或触发构建的入口 |

---

## 7. AGT2-01 Agent 优化设计（ROCKS 范式）

优化经现有 `packages/hcp-engagement-agent` 与 BFF 交付，不新增对外 MCP 工具。

| 项 | 设计 |
| --- | --- |
| 提示词模板化 | 一人一策、开放对话、一句话洞察三类任务的 system 与任务提示词收进带版本号的模板（`prompts/v1/…`）；模板名与版本写进 run metadata |
| ROCKS 结构 | 每个模板按 ROCKS 范式分段组织（角色、目标、上下文、关键事实、输出要求）；上下文注入沿用「RAG 仅 tool_result、Twin 走 get_twin_insights」的 Knowledge 加载策略 |
| 评测门禁 | 三类任务各建 eval-set（含朱同玉 fixture 锚点）；每次提示词或模型变更跑 eval，通过才合入 |
| 时延 | Options 生成与对话首响应记时延预算；超预算触发降级 |
| 降级 | 无 Key、超时或 LLM 失败 → 既有规则路径（`ruleProposeOptions` / `ruleSynthesizeDoingNow`）；`LLM_UNAVAILABLE` 错误码保留 |
| 交付面 | 经现有 Agent 包 + BFF；对外 MCP 无决策面工具（ADR-012），ROCKS 收益经 Web 呈现 |

---

## 8. 数据架构（2.0 增量）

| 存储 | 内容 | 变化 |
|------|------|------|
| MySQL 主库（ADR-005） | Twin、Insights、Options、Session、manifest | 无新表；`add_hcp` / `precheck` 复用现有表与 `@hca/db` 事务 |
| `openalex_aliases` | 多 OpenAlex ID 并存（ADR-004） | 随 Twin JSON 经 `query_hcp` / `get_hcp_insights` / `add_hcp` 暴露 |
| Qdrant | 向量 | 不变；`propose` 经 medical-kb 检索 |
| 租户 | `tenant_id` 过滤 | 2.0 仅作为检索过滤参数；租户 SOP 入库（F-RAG-021）仍为 LOW PRIORITY |

---

## 9. 测试与门禁

基线：[mcp2.0/mcp2-test.md](./mcp2.0/mcp2-test.md) + [spec1.0/7.test-strategy.md](./spec1.0/7.test-strategy.md)（更严者胜）。

| 层 | 对象 | 要点 |
| --- | --- | --- |
| 单元 | handler 入参校验、错误码映射、`confirmAndSaveTwin` 抽取回归 | 无网络 |
| 集成 | handler → `@hca/db` / Agent（fixture DB、mock LLM） | 默认 CI |
| 契约 | 六 tool JSON Schema 与 product-backlog 一致 | schema 快照 |
| E2E（可选） | 真实 MCP Client 经 Streamable HTTP 调 tool | 本地或 nightly |

Sprint 门禁：

| Sprint | 必绿 |
|--------|------|
| 1 | 进程启动 + tools/list 含三工具；三工具 happy path + `VALIDATION_ERROR` / `NOT_FOUND` 各一例 |
| 2 | `get_hcp_insights`、`retrieve_academic` 契约 + medical-kb 集成（无 LLM，ADR-012）；ROCKS eval-set 建立并首跑 |
| 3 | `retrieve_compliance` 契约（条款引用、`tenant_id` 非入参、description 非预审声明，ADR-012）；TWIN2-01 调度器单测（TTL 跳过、失败不阻断、env 关闭） |

覆盖率：变更包语句/分支 ≥ 80%；错误映射与幂等更新路径行覆盖 100%。

---

## 10. 部署与运维

| 项 | 设计 |
| --- | --- |
| 本地 | `npm run dev:hcp-engagement-mcp`（新 workspace script）；`TWIN_REFRESH_CRON` 不设即关闭刷新 |
| 容器 | 复用 GHCR 制品模式（ADR-006）：CI 新增 `hcp-engagement-mcp` 镜像；compose 增加该服务，仅内网端口 |
| 回滚 | 部署上一版镜像；数据只增不删（新增可选列 / 新包），无需数据回滚 |
| 监控 | `/health` 接入既有健康检查；每工具失败码计数周看 |

---

## 11. 架构决策记录（2.0 增量）

| ID | 决策 | 理由 | 放弃方案 |
|----|------|------|----------|
| ADR-2.0-1 | 对外 MCP 独立新包，不并入对内 `hcp-twin-mcp` | 采集面不外泄；DoD 硬约束 | 内部 MCP 加六工具 |
| ADR-2.0-2 | handler 全薄，业务逻辑沉淀共享包 | 不复制 BFF 路由逻辑；单一真相源 | handler 内重写业务 |
| ADR-2.0-3 | `confirmAndSaveTwin` 抽到 `@hca/db` | BFF 与 MCP2 共用；回归可测 | 复制 confirm 逻辑 |
| ADR-2.0-4 | TWIN2-01 进程内调度器 | 最轻方案满足约束；无新进程 | 独立 worker / BullMQ |
| ADR-2.0-5 | 2.0 不做鉴权，仅内网可达 | 用户决策（2026-10-19） | Bearer Token |
| ADR-2.0-6 | ROCKS 优化走模板版本 + eval 门禁 | 可回滚、可评测；交付面不变 | 即席改提示词 |

---

## 12. 开放问题

| 项 | 影响 | 状态 |
|----|------|------|
| `list_hcp` 无分页的响应体积 | HCP 量大后膨胀 | Sprint 1 接受；超阈值再开分页故事 |
| `knowledge_jobs` 触发条件 | `add_hcp` 是否联动学术 ingest | MVP 默认不联动；如需联动另开故事 |
| ROCKS eval-set 的具体用例数 | AGT2-01 验收口径 | Sprint 2 开工前定 |

---

## 13. 相关文档

| 文档 | 内容 |
|------|------|
| [product-backlog.md](./product-backlog.md) | 2.0 目标、六工具契约、DoD |
| [sprint-backlog.md](./sprint-backlog.md) | Sprint 1–3 排期 |
| [mcp2.0/mcp2-design.md](./mcp2.0/mcp2-design.md) | 对外 MCP 边界与包建议 |
| [mcp2.0/mcp2-stories.md](./mcp2.0/mcp2-stories.md) | US-MCP2-001…003 验收标准 |
| [mcp2.0/mcp2-test.md](./mcp2.0/mcp2-test.md) | 测试范围与门禁 |
| [spec1.0/3.architecture.md](./spec1.0/3.architecture.md) | 1.0 整体架构（仍有效） |
| [spec1.0/5.hcp-twin-data-dictionary.md](./spec1.0/5.hcp-twin-data-dictionary.md) | Twin 数据字典（含 `openalex_aliases`） |
