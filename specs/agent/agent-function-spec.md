# hcp-engagement-agent 功能规格

> as_of：2026-07-16 · 包名建议 `@hca/hcp-engagement-agent`  
> 依据：[`1.product-definition.md`](../1.product-definition.md)、[`3.architecture.md`](../3.architecture.md) §5.4、[`4.install-dependencies.md`](../4.install-dependencies.md) §8、[`../app/app-function-spec.md`](../app/app-function-spec.md)、[`../../knowledge/agent-hcp-engagement/design-direction.md`](../../knowledge/agent-hcp-engagement/design-direction.md)、**agent-builder**、cn-hcp-pro / cn-hcp-compliance  
> 设计：[`agent-design.md`](./agent-design.md)  
> 范围：`packages/hcp-engagement-agent` — 决策与对话层（**LlmClient 默认 Qwen** + 一句话洞察 + 5 Capabilities + 薄 LangGraph + **open_chat / revise_options**）。**不是**爬虫、不是向量库；学术/合规检索经 `medical-kb`，Twin 事实经远程 MySQL。

## 0. 结论（先读）

| 原则 | 要求 |
|------|------|
| Purpose | （1）合成可审计的**一句话洞察**；（2）生成并迭代 **Engagement Options**；（3）在 Agent Web UI 以 **chat 模式**对话——非通用营销文案机 |
| Capabilities | 提案主路径 P0 **5 个** Tool；一句话洞察用**包级 API**（不塞进 Options 工具表，避免工具膨胀）；chat 模式复用同一 loop |
| Harness | 模型即智能体；代码提供 loop + tools；主路径薄 LangGraph；chat / 修订由模型自主选 tool |
| **LLM 接入** | 后台经 **Provider 适配层**调用模型；**默认 Qwen**（DashScope OpenAI 兼容）；可用配置切换其它兼容提供方；**禁止**浏览器持有 API Key |
| Knowledge | cn-hcp-pro / 合规模板按需；RAG 仅经 tool_result；勿塞满 twin.json / 整库 |
| 合规 | Options 路径：`retrieve_compliance` **不可跳过**；生成后 Fail-fast；输出**不替代**正式 MLR |
| 批次 | 功能与对外接口「实现批次」填 **MVP-1…MVP-4**（见 [`1.product-definition.md`](../1.product-definition.md)） |

```text
感知层   hcp-twin-mcp        → Twin / Insights 骨架（事实字段）
知识层   medical-kb (RAG)    → academic ‖ compliance
决策层   hcp-engagement-agent ← 本规格（洞察文案 + Options + chat）
表达层   Web（数字分身 / HCP洞察 / 一人一策 / Agent Tab）
约束层   cn-hcp-compliance   → Fail-fast（人审 MLR 在外）
```

**一句话洞察分工：** MCP Stage E 可写结构化草稿；**列表/详情/HCP洞察展示用的** `doing_now.summary`（+ 可选 `analysis`）由 Agent `synthesizeDoingNow` 生成或刷新；数字分身与 HCP 洞察**同源同字段**。

---

## 1. 哪些功能会调用到 Agent

### 1.1 直接调用（BFF → Agent）

| Web 功能 | 编号 | BFF 入口 | Agent 行为 |
|----------|------|----------|------------|
| 数字分身列表/详情 · 一句话洞察 | F-WEB-005 / F-WEB-007 | `POST /api/insights/doing-now`（或 Twin 构建完成后自动触发） | `synthesizeDoingNow` → 写 `insights.doing_now`；UI 只读展示 |
| HCP 洞察 · 一句话洞察（含分析） | F-WEB-018 | 同上（同源） | 同一 `doing_now`；展示 `summary` + 可选 `analysis` |
| 生成 Engagement 方案 | F-WEB-027 | `POST /api/engagement/options` | `proposeOptions`（内含读 Insights、双检索、gate、落盘） |
| 送合规闸门检查 | F-WEB-028 | `POST /api/engagement/compliance-check`（或 options 内嵌） | `runComplianceGate` |
| 一人一策页底短对话 | F-WEB-029 | `POST /api/engagement/chat` | **`mode=revise_options`**：绑当前方案 + `revise_engagement` |
| Agent Web UI 对话（chat 模式） | F-WEB-030 | `POST /api/engagement/chat` | **`mode=open_chat`**：**通用**开放对话（不默认绑定分身）；模型自主选 tool |
| Agent 流式回复 | F-WEB-034 | 同上 + SSE | 流式 token；每轮落盘 session |
| Options / Chat API | F-WEB-038 | 上列路由 | BFF 对 Agent 包的薄封装 |

附件（F-WEB-032）仅进入 **chat / revise** 请求上下文。历史（F-WEB-031）：浏览器 **localStorage** 存索引与正文；Agent/BFF 按 `sessionId` 读写 Postgres（`open_chat` → `_agent_general`）。

### 1.2 间接 / 可选

| 场景 | 是否调 Agent | 说明 |
|------|--------------|------|
| HCP 洞察其余块（科研/热力/证据表） | 否 | 读 Twin/Insights JSON；不经 Agent |
| 洞察页「解释为何这样建议」 | 是（可选） | 可开 `open_chat` 由用户粘贴洞察摘要；**不**自动绑当前分身。分身级修订用 `revise_options` |
| Twin 构建完成后补洞察文案 | 是 | BFF 在 `build_twin` 完成后调 `synthesizeDoingNow` |
| Twin 确认后专科 ingest | 否（P0） | `medical-kb`；非 Agent Capability |
| 数字分身 CRUD / MCP 采集事实 | 否 | `hcp-twin-mcp`（Agent 不爬虫） |

### 1.3 不调用 Agent

应用壳、Tab 门禁、查询/消歧、职业轴/热力表渲染、导出、鉴权等展示与采集类功能（除 §1.1 所列）不进入 Agent。

---

## 实现批次说明

功能与接口「实现批次」填 **MVP-1…MVP-4**，见 [`1.product-definition.md`](../1.product-definition.md)。

| MVP | 本规格重心 | 验收重心 |
|-----|------------|----------|
| **MVP-2** | LlmClient、`synthesizeDoingNow`、同源消费 | 列表/详情/洞察同一 `doing_now` |
| **MVP-4** | 5 Tools、薄 LangGraph、Options、闸门、`revise_options`、`open_chat`、流式/附件 | 方案闭环 + 开放对话（mode 不混用） |

旧 A0–A5 代号废止。

---

## 功能列表

| 序号 | 功能编号 | 功能名称 | 功能简述 | 实现批次 |
|------|----------|----------|----------|----------|
| 1 | F-AGT-001 | Agent 壳与循环 | 模型 loop：context + capabilities → act 或 respond；包内无 Playwright/爬虫 | MVP-2 |
| 2 | F-AGT-001a | 后台 LLM Provider 适配层 | 统一 `LlmClient`（chat / chatStream / tool-calling）；业务与具体厂商 SDK 解耦；**默认 provider=`qwen`** | MVP-2 |
| 3 | F-AGT-001b | 默认 Qwen（DashScope） | 经 OpenAI 兼容端点调用 `qwen-plus` / `qwen-max`（可配）；`openai` SDK + `DASHSCOPE_*` | MVP-2 |
| 4 | F-AGT-001c | 配置切换提供方 | `LLM_PROVIDER` + `LLM_MODEL` + `LLM_BASE_URL` + `LLM_API_KEY`（或厂商专用键）；支持至少：`qwen`（默认）、`openai_compatible`（任意兼容端点）；新增厂商只加 adapter，不改 Capabilities | MVP-2 |
| 5 | F-AGT-001d | Key 与调用边界 | Key 仅服务端（Agent/BFF 进程）；浏览器禁止直连 LLM；请求写 `model` / `provider` 入 Option/session metadata 便于审计 | MVP-2 |
| 6 | F-AGT-002 | 薄 LangGraph 主路径 | `get_twin_insights` → academic ‖ compliance → gate → generate → compliance_check → persist；勿硬编码百步旅程 | MVP-4 |
| 7 | F-AGT-003 | 短 system / Skill 注入 | cn-hcp-pro 输出模板与人设**短**载入；禁止全文塞 prompt | MVP-4 |
| 8 | F-AGT-004 | Context 保护 | 截断冗长 RAG；Insights 经 tool 注入，不整包 twin.json | MVP-4 |
| 9 | F-AGT-005 | Zod 入参校验 | 对外入口与各 Capability 入参 Zod；结构化错误无堆栈 | MVP-2 |
| 10 | F-AGT-006 | Options 入库 | 写 Postgres `engagement_options`；事务写 | MVP-4 |
| 11 | F-AGT-007 | Session 入库 | 写 Postgres `chat_sessions`；区分 `mode`；`open_chat` 用 `hcp_id=_agent_general`；`revise_options` 用真实 `hcpId`；浏览器另存 localStorage | MVP-4 |
| 12 | F-AGT-008 | 一句话洞察合成 | `synthesizeDoingNow`：生成 `doing_now.summary`（1–3 句）+ 可选 `analysis`；summary 空/缺失时写入，`refresh=true` 强制覆盖；**拥有展示权威**（Stage E 不写最终 summary） | MVP-2 |
| 13 | F-AGT-009 | 数字分身一句话洞察消费 | 支撑 F-WEB-005/007：列表截断 + 详情摘要条；与 HCP 洞察同源字段 | MVP-2 |
| 14 | F-AGT-010 | HCP 洞察一句话洞察消费 | 支撑 F-WEB-018：摘要条 + 可选分析段；禁止与数字分身两套文案 | MVP-2 |
| 15 | F-AGT-011 | Capability：读 Insights | `get_twin_insights(hcpId)` → insights（含 doing_now / opportunities / interest_directions / tags 旁注） | MVP-4 |
| 16 | F-AGT-012 | Capability：学术检索 | `retrieve_academic` → medical-kb；按 specialty/themes 过滤；结果带 citation | MVP-4 |
| 17 | F-AGT-013 | Capability：合规检索 | `retrieve_compliance` **强制**（Options 路径）；tenant 过滤 SOP；无命中 → gate 降级/拒敏 | MVP-4 |
| 18 | F-AGT-014 | Capability：提案 Options | `propose_engagement_options` → 经 `LlmClient` 生成 3–5 条；UI 字段 + `academic_refs` + `compliance_refs` | MVP-4 |
| 19 | F-AGT-015 | Capability：修订 Options | `revise_engagement`：session + 反馈（+ 附件元数据）→ 写回 Options/消息 | MVP-4 |
| 20 | F-AGT-016 | 合规 gate（检索后） | 敏感互动无合规 chunk → 拒答或标注「需人工合规确认」 | MVP-4 |
| 21 | F-AGT-017 | 合规 Fail-fast（生成后） | cn-hcp-compliance；通过 / 附条件 / 拒绝 | MVP-4 |
| 22 | F-AGT-018 | Permissions 硬边界 | 不编造说明书外疗效；院内旁注机构同意+代表备案；不替代 MLR；不用处方/统方 | MVP-4 |
| 23 | F-AGT-019 | Agent Web UI · chat 模式 | `mode=open_chat`：**通用**多轮对话（不强制 `hcpId`、不默认注入 Twin）；经 `LlmClient`；会话落 `_agent_general` | MVP-4 |
| 24 | F-AGT-020 | 一人一策 · 修订模式 | `mode=revise_options`：页底短对话；必须绑当前方案；默认走 `revise_engagement` | MVP-4 |
| 25 | F-AGT-021 | 对话路径编排 | chat/修订均不强制重跑全图；模型决定是否再检索 | MVP-4 |
| 26 | F-AGT-022 | 流式输出 | `LlmClient.chatStream` → BFF SSE；对齐 F-WEB-034。**LOW PRIORITY**（P0 非流式已交付） | MVP-4 · LOW PRIORITY |
| 27 | F-AGT-023 | 附件上下文 | 仅 chat 类请求；摘要进 context，不默认可执行任意文件 | MVP-4 |
| 28 | F-AGT-024 | 租户产品上下文 | 适应症/SOP 来自 tenants 或 compliance 检索；**不写入** Twin。**LOW PRIORITY** | MVP-4 · LOW PRIORITY |
| 29 | F-AGT-025 | 标签与渠道缺省 | 消费 `profile.tags`：T1→偏 MSL；行政/政策→慎促销 | MVP-4 |
| 30 | F-AGT-026 | 机会 → Option 映射 | 以 `insights.opportunities` 为主输入 | MVP-4 |
| 31 | F-AGT-027 | 结构化错误 | 无 Twin、LLM 不可达、RAG/gate 失败 → `AGENT_ERROR` / `LLM_*` | MVP-4 |
| 32 | F-AGT-028 | LLM 与运行配置 | 见 §2.3 环境变量；缺 Key 时启动失败或 health=`llm:down`（可配严格模式） | MVP-2 |
| 33 | F-AGT-029 | 契约测试 | Vitest：mock `LlmClient`；5 tools、doing_now、双引用、合规、chat mode；另测 provider 解析 | MVP-4 |
| 34 | F-AGT-030 | 朱同玉验收 | live Qwen（或配置的 provider）下 doing_now + Options + open_chat | MVP-4 |

---

## 对外接口列表

BFF（及测试）调用本包 API；浏览器只调 BFF。下列 **Capability** 是 Agent 内部 tools（供模型调用），不是浏览器直连接口。

### 2.1 BFF 可调入口（包级 API）

| 序号 | 接口编号 | 类型 | 接口名称 | 输入摘要 | 输出摘要 | 副作用 | 幂等 | 实现批次 |
|------|----------|------|----------|----------|----------|--------|------|----------|
| 1 | I-AGT-001 | API | `synthesizeDoingNow` | `{ hcpId, refresh?: boolean, locale?: "zh-CN"\|"en" }` | `{ doing_now: { summary, analysis?, evidence_refs?, as_of, locale? } }` | 写入 `insights.locales[locale].doing_now`（并同步顶层兼容字段）；**不覆盖**另一语言桶；同 locale 可复用 | 同 Twin 版本且同 locale 重复调用结果应稳定 | MVP-2 |
| 2 | I-AGT-002 | API | `proposeOptions` | `{ hcpId, tenantId?, productContext?, locale?: "zh-CN"\|"en" }` | `{ runId, options[3..5], gate_result? }` | 写 options JSON（`run.locale`）；latest 按语言隔离；叙事语言跟 `locale` | 否 | MVP-4 |
| 3 | I-AGT-003 | API | `chat` | `{ mode: "open_chat" \| "revise_options", sessionId?, hcpId?, message, optionRunId?, attachments?, locale?: "zh-CN"\|"en" }` | `{ sessionId, mode, messages[], options? }`（可流式） | 写/更新 session；`revise_options` 可改 options；`open_chat` 的 `hcpId` 可选；回复语言跟 `locale` | 否 | MVP-4 |
| 4 | I-AGT-004 | API | `runComplianceGate` | `{ hcpId, optionRunId }` | `{ status: pass\|conditional\|reject, findings[] }` | 可回写 options 旁注 | 是 | MVP-4 |
| 5 | I-AGT-005 | API | `health`（可选） | `{}` | `{ ok, llm: { provider, model, reachable }, database_ok, medical_kb? }` | 无 | 是 | MVP-2 |

#### Chat 模式约定（Agent Web UI）

| `mode` | UI | 必填 | 行为 |
|--------|-----|------|------|
| `open_chat` | **HCP Engagement Agent** Tab（F-WEB-030） | 无强制 `hcpId`（通用 Agent） | 开放对话：疾病领域找人、渠道/合规/访前等；**不**默认注入某位 Twin 洞察；改 Options 须到一人一策修订模式 |
| `revise_options` | 一人一策页底（F-WEB-029） | `hcpId` + `optionRunId` | 短对话修订当前方案；优先 `revise_engagement` |

同一 `sessionId` 不应混用两种 mode；切换 mode 时新建会话。

### 2.3 后台 LLM 接入（Provider 适配）

所有生成路径（`synthesizeDoingNow` / `proposeOptions` / `chat`）**只**经 `LlmClient`，不直散厂商 SDK。

```text
Agent 业务（loop / LangGraph / synthesize）
        │
        ▼
   LlmClient（统一接口）
        │
        ├─ QwenAdapter          ← 默认（DashScope OpenAI 兼容）
        └─ OpenAICompatibleAdapter  ← 配置切换（OpenAI / 其它兼容网关）
```

| 配置项 | 默认 | 说明 |
|--------|------|------|
| `LLM_PROVIDER` | `qwen` | `qwen` \| `openai_compatible`（可扩展枚举） |
| `LLM_MODEL` | `qwen-plus` | 模型名；可用 `qwen-max` 等 |
| `LLM_BASE_URL` | DashScope 兼容地址 | `qwen` 时可用 `DASHSCOPE_BASE_URL` 覆盖 |
| `LLM_API_KEY` | — | 通用键；`qwen` 时可用 `DASHSCOPE_API_KEY` 作为别名 |
| `DASHSCOPE_API_KEY` | — | **Qwen 默认路径**推荐填写 |
| `DASHSCOPE_BASE_URL` | DashScope 官方兼容 endpoint | 可选 |
| `DATABASE_URL` | （必填） | 远程 MySQL；与 web / MCP 共用 |
| `HCA_DATA_DIR` | `./data` | 可选；仅 RAG 语料根 |
| `LLM_TIMEOUT_MS` | 实现自定 | 超时 → `LLM_TIMEOUT` |
| `LLM_MAX_RETRIES` | 实现自定 | 可重试错误 |

**适配约定**

| 项 | 要求 |
|----|------|
| 接口 | `chat`、`chatStream`、tool/function calling（与 LangGraph/openai tool schema 对齐） |
| 默认 | `LLM_PROVIDER=qwen` 未配置时行为与现网 DashScope Qwen 一致 |
| 切换 | 改环境变量即可；**不改** Capability 名称与 BFF 路由 |
| 审计 | Options / session / doing_now 元数据写入 `llm: { provider, model }` |
| 安全 | Key 仅进程环境；日志脱敏；浏览器永不持有 Key（对齐 F-WEB-035） |
| 测试 | 单测注入 mock `LlmClient`；CI 不强制 live Key |

### 2.4 P0 Capabilities（Agent Tools · Options/Chat loop 内 5 个）

| 序号 | 接口编号 | 类型 | 接口名称 | 输入摘要 | 输出摘要 | 副作用 | 幂等 | 实现批次 |
|------|----------|------|----------|----------|----------|--------|------|----------|
| 6 | I-AGT-006 | Tool | `get_twin_insights` | `{ hcpId }` | Insights（含 `doing_now`） | 无 | 是 | MVP-4 |
| 7 | I-AGT-007 | Tool | `retrieve_academic` | `{ hcpId, query?, specialty?, themes? }` | `{ chunks[] }` + citations | 无 | 是 | MVP-4 |
| 8 | I-AGT-008 | Tool | `retrieve_compliance` | `{ hcpId, tenantId?, interaction_type? }` | `{ chunks[] }`；**propose 路径必调** | 无 | 是 | MVP-4 |
| 9 | I-AGT-009 | Tool | `propose_engagement_options` | `{ hcpId, academic_refs?, compliance_refs? }` | `{ runId, options[3..5] }` | 写 options/ | 否 | MVP-4 |
| 10 | I-AGT-010 | Tool | `revise_engagement` | `{ sessionId, hcpId, feedback, optionRunId? }` | 修订后 options + 助手回复 | 写 session / options | 否 | MVP-4 |

> **工具表仍保持 5 个**（agent-builder）。一句话洞察是 **I-AGT-001 包级 API**（固定短链路：读 Twin 摘要 → `LlmClient` → 写 `doing_now`），不占用模型选 tool 名额。`open_chat` 内若需刷新洞察，BFF/harness 可再调 I-AGT-001——P0 不把 `synthesize_doing_now` 加成第 6 个 Tool。

### DoingNow 字段契约（与数据字典 §11.9 对齐）

| 字段 | 说明 |
|------|------|
| `summary` | 1–3 句，可审计；**数字分身列表/详情与 HCP 洞察共用** |
| `analysis` | 可选；访前解读（分层/分轨）；推断须可追溯 |
| `evidence_refs[]` | 可选；指向 themes / activity / roles 等 |
| `as_of` | 生成日 |

### Option 字段契约（与 UI 对齐 · schema 待专文冻结）

| 字段 | 说明 |
|------|------|
| `action` | 动作（拜访 / 企微 / 科室会 / MSL 等） |
| `owner` | 建议负责人 |
| `channel` | 渠道 |
| `theme` | 内容主题 |
| `success_signal` | 成功信号 |
| `compliance_note` | 合规旁注（caption 级） |
| `priority` | 优先级 |
| `academic_refs[]` | 学术引用（强制有则优） |
| `compliance_refs[]` | 合规引用（敏感动作强制） |
| `llm` | 可选 `{ provider, model }` 审计字段 |

### 错误契约（摘）

| code | 场景 | retryable |
|------|------|-----------|
| `VALIDATION_ERROR` | Zod 失败 | 否 |
| `INSIGHTS_NOT_FOUND` | 无 Twin/Insights 骨架 | 否 |
| `DOING_NOW_INPUT_INSUFFICIENT` | 事实过少无法写可审计 summary | 否（可降级短句+low confidence） |
| `COMPLIANCE_RETRIEVAL_EMPTY` | 无合规命中且动作敏感 | 否（须降级文案） |
| `COMPLIANCE_REJECTED` | Fail-fast 拒绝 | 否 |
| `RAG_UNAVAILABLE` | medical-kb/Qdrant 不可用 | 是 |
| `LLM_CONFIG_INVALID` | provider/model/Key 缺失或非法 | 否 |
| `LLM_AUTH_FAILED` | Key 无效 / 未授权 | 否 |
| `LLM_TIMEOUT` | 调用超时 | 是 |
| `LLM_RATE_LIMITED` | 提供方限速 | 是 |
| `LLM_ERROR` | 其它模型调用失败 | 是 |
| `CHAT_MODE_MISMATCH` | session mode 与请求 mode 不一致 | 否 |

### 调用顺序（给 BFF）

```text
进程启动
  → 解析 LLM_* / DASHSCOPE_* → 构造 LlmClient（默认 qwen）

Twin 构建完成（或用户刷新洞察）
  → I-AGT-001 synthesizeDoingNow  （经 LlmClient）
       → 写 insights.doing_now
       → F-WEB-005/007/018 只读展示（同源）

一人一策「生成方案」
  → I-AGT-002 proposeOptions
       └─ tools: get_twin_insights → retrieve_academic ‖ retrieve_compliance
            → gate → propose_engagement_options（LlmClient）→ compliance_check

「送合规闸门检查」
  → I-AGT-004 runComplianceGate

一人一策页底短对话
  → I-AGT-003 chat(mode=revise_options, optionRunId=…)  （LlmClient）

Agent Web UI（HCP Engagement Agent Tab）
  → I-AGT-003 chat(mode=open_chat)  （LlmClient ± stream；无强制 hcpId）
       └─ 通用人设；不默认 get_twin_insights；分身修订引导至 revise_options
```
---

## 依赖关系（简图）

```text
A0 壳 / Zod / LlmClient（默认 qwen）/ Postgres 持久化
  └─► A1 五 Capability + medical-kb 客户端
        └─► A2 synthesizeDoingNow（数字分身 ‖ HCP 洞察同源）
              └─► A3 proposeOptions 主路径 + 双引用
                    └─► A4 open_chat ‖ revise_options + 流式 / 附件
                          └─► A5 Fail-fast + 朱同玉验收
```

---

## 非目标

- Twin 采集 / Playwright（`hcp-twin-mcp`）
- Qdrant embedding / ingest 管线实现（`medical-kb`）
- Web UI 组件实现细节（见 app-function-spec；本规格只定 Agent 契约）
- 为「一句话洞察」与「开放 chat」各建独立 Agent 进程（同一包、分 mode / API）
- 浏览器或前端直连 LLM / 暴露 API Key
- 为每个厂商复制一套 Capabilities（只加 Provider adapter）
- 多 Agent 路由、自动办会、讲课费支付、CRM 回写
- 正式 MLR 电子签（仅闸门结果与旁注）
- 向 Options loop 无证据地扩到 6+ Tool（`synthesizeDoingNow` 保持包级 API）

---

## Open questions（已决 · 2026-07-17）

| # | 问题 | 决定 | 落地 |
|---|------|------|------|
| 1 | `EngagementOption` / `ChatSession` Zod 正式冻结 | **在 MVP-4 开工前冻结于 `@hca/domain`**；`ChatSession` 必含 `mode` + `llm`；Option 字段以本规格 §Option 契约为基线，另文可扩但不改名破坏兼容 | domain 专文 / schema 模块 |
| 2 | 合规闸门：生成后一步 vs 用户按钮 | **共用 `I-AGT-004` `runComplianceGate`**。提案主路径末可自动调用；一人一策「送合规闸门」按钮调同一 API | F-WEB-028 · F-AGT-017 |
| 3 | Insights「解释建议」是否另开 API | **否**。可用通用 `open_chat`（用户自带摘要）或一人一策修订；不自动绑分身 | 已决 |
| 4 | Stage E 草稿 vs `synthesizeDoingNow` 覆盖策略 | **Agent 拥有展示用 `doing_now.summary`（+ `analysis`）**。MCP Stage E 只写结构化草稿（兴趣/机会等），**不写最终 summary**。`synthesizeDoingNow`：summary 为空或缺失时写入；`refresh=true` 强制覆盖；同 Twin 版本重复调用结果应稳定 | F-AGT-008 · F-MCP-023 |
| 5 | `open_chat` 是否直接改写 `doing_now` | **P0 否**。须经 BFF/`I-AGT-001` | F-AGT-019 |
| 6 | P0 是否预置第二家命名厂商 adapter | **否**。P0 仅 `qwen`（默认）+ `openai_compatible` 通用适配；新厂商只加 adapter，不改 Capabilities | F-AGT-001c |
| 7 | `open_chat` 是否绑定「当前 HCP」 | **否**。通用 Agent；落库 `_agent_general`；本机 localStorage 不按 HCP 过滤 | F-WEB-030 · F-AGT-019 |

---

## 相关文档

- 设计：[`agent-design.md`](./agent-design.md)
- 产品 MVP：[`../1.product-definition.md`](../1.product-definition.md)
- 构建提示：[`initial-prompt.md`](./initial-prompt.md)
- 设计方向：[`../../knowledge/agent-hcp-engagement/design-direction.md`](../../knowledge/agent-hcp-engagement/design-direction.md)
- 架构：[`3.architecture.md`](../3.architecture.md) §5.4
- 依赖：[`4.install-dependencies.md`](../4.install-dependencies.md) §8（Qwen / DashScope）
- Web 功能：[`../app/app-function-spec.md`](../app/app-function-spec.md)
- Twin 字典：[`5.hcp-twin-data-dictionary.md`](../5.hcp-twin-data-dictionary.md) §11.9 DoingNow
- UI：[`6.ui-guideline.md`](../6.ui-guideline.md)
- MCP：[`../mcp/mcp-function-spec.md`](../mcp/mcp-function-spec.md)
- Skills：cn-hcp-pro、cn-hcp-compliance、agent-builder
- 用户故事与 AC：[`agent-stories.md`](./agent-stories.md)
