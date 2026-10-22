# hcp-engagement-agent 设计

> as_of：2026-07-17  
> 包：`@hca/hcp-engagement-agent`  
> 规格：[`agent-function-spec.md`](./agent-function-spec.md) · 构建提示：[`initial-prompt.md`](./initial-prompt.md)  
> 原则：**agent-builder**（模型即智能体；5 Tools；Knowledge 按需）

## 1. Purpose 与边界

**Purpose**：在中国医药合规边界内，基于 Twin Insights + 双路 RAG，为指定 HCP 合成一句话洞察、生成/迭代 Engagement Options，并支持对话。

| 做 | 不做 |
|----|------|
| `synthesizeDoingNow` / Options / chat | 爬虫、Playwright、自建向量库 |
| 经 medical-kb 检索 | 全科预灌、直连 Qdrant |
| 合规 gate + Fail-fast | 替代正式 MLR、CRM 回写、办会 |

```text
MCP Twin/Insights → Agent（决策）← medical-kb academic‖compliance
                         ↓
              Web：数字分身 / 洞察 / 一人一策 / Agent Tab
```

---

## 2. 三要素（agent-builder）

| 要素 | 设计 |
|------|------|
| **Capabilities** | Loop 内 **5 Tools**；包级 API 另计（不做第 6 Tool） |
| **Knowledge** | cn-hcp-pro **短**模板；RAG 仅 tool_result；勿塞 twin.json / 全文 skill |
| **Context** | 截断 RAG；Insights 经 tool；session 分 mode；附件只进摘要 |

```text
LOOP:
  短 system + 会话 + tool_results
  → 模型：act（tool）或 respond
  → act：执行 → 写入 context → 继续
  → respond：返回用户 / 写 Postgres
```

---

## 3. 对外入口（BFF → 包）

| API | 触发 | 行为 |
|-----|------|------|
| `synthesizeDoingNow` | Twin 完成后 / `POST /api/insights/doing-now` | 写 `doing_now`（列表与洞察页**同源**） |
| `ensureDoingNow` | `get_hcp_insights` 按需 / build 完成 / TWIN2-01 定时（ADR-013） | 幂等合成 `doing_now` 并写回缓存；已有进行中 run 时复用，不重复起任务 |
| `proposeOptions` | 一人一策「生成方案」 | 薄 LangGraph 提案主路径 |
| `chat` | Agent Tab / 页底短对话 | `open_chat` \| `revise_options` |
| `runComplianceGate` | 「送合规闸门」 | Fail-fast；不替代 MLR |
| `health` | `/api/health` | llm + db + medical-kb? |

### Chat 模式

| mode | UI | 约束 |
|------|-----|------|
| `open_chat` | Agent Tab | **通用**（不强制 `hcpId`）；模型自主选 tool；分身级修订走 `revise_options` |
| `revise_options` | 一人一策页底 | 必填 `hcpId` + `optionRunId`；优先 `revise_engagement` |

同一 `sessionId` 不混用 mode。

---

## 4. P0 Capabilities（5 Tools）

| Tool | 作用 | 硬规则 |
|------|------|--------|
| `get_twin_insights` | 读 Postgres Insights | 不返回整包 twin |
| `retrieve_academic` | medical-kb 学术 | specialty/themes 过滤 + citation |
| `retrieve_compliance` | medical-kb 合规 | **提案路径不可跳过** |
| `propose_engagement_options` | 生成 3–5 条 | 须含 `academic_refs` + `compliance_refs` |
| `revise_engagement` | 按反馈改方案 | 写 session / options |

---

## 5. 四条运行路径

### A. 一句话洞察

```text
BFF → synthesizeDoingNow(hcpId)
  → 读 Insights 事实（可内部调 get 或仓储）
  → LlmClient → doing_now.summary (+ analysis?)
  → 写 Postgres insights；metadata.llm
```

三个触发源（ADR-013）收敛到幂等入口 `ensureDoingNow(hcpId)`，内部走同一 `synthesizeDoingNow` 语义：

1. build 完成：对内 build 管线结束后调用（含 TWIN2-01 定时与 `add_hcp` 异步触发的 build）。
2. TWIN2-01 定时：调度器逐 HCP 刷新后经 build 完成回调触发。
3. 工具内按需：对外 `get_hcp_insights` 读到空模板且事实足够时服务器内调用；LLM 失败降级返回空模板 + `pending: true`。

### B. 提案（薄 LangGraph）

```text
START
  → get_twin_insights
  → retrieve_academic ‖ retrieve_compliance
  → compliance_gate（无命中 → 降级/拒敏）
  → propose_engagement_options（LlmClient）
  → cn-hcp-compliance Fail-fast
  → persist options（Postgres）
END
```

勿硬编码百步旅程；节点仅保强制合规与引用。

### C. open_chat（通用）

```text
chat(mode=open_chat) → 通用人设 + 对话历史（± 附件元数据）
  → LlmClient → 写 session（hcp_id=_agent_general）
```

- 不强制 `hcpId`；不默认注入 Twin / Insights。  
- 浏览器 localStorage 另存索引与正文。  
- 不强制重跑提案全图。

### D. revise_options

```text
chat(mode=revise_options, optionRunId) → 默认 revise_engagement → 可再 retrieve_* → 写回
```

---

## 6. LLM（LlmClient）

```text
业务 → LlmClient → QwenAdapter（默认）| OpenAICompatibleAdapter
```

| 项 | 约定 |
|----|------|
| 默认 | `LLM_PROVIDER=qwen`（DashScope 兼容） |
| 切换 | 只改环境变量，不改 Tool/BFF 名 |
| Key | 仅服务端；浏览器禁止 |
| 审计 | options/session/doing_now 写 `llm: { provider, model }` |

---

## 7. Option 输出契约（对齐 UI）

每条含：动作 / 负责人 / 渠道 / 主题 / 成功信号 / 合规旁注 / 优先级 + `academic_refs[]` + `compliance_refs[]` + `mlr_status=draft_not_reviewed`。

消费 `profile.tags`：T1→偏 MSL；行政/政策→慎促销。主输入：`insights.opportunities`。

---

## 8. Permissions

- 不编造说明书外疗效  
- 院内活动旁注：机构同意 + 代表备案  
- 不用处方/统方/非公开 CRM  
- 产品/SOP 上下文可入检索，**不写入** Twin  
- 输出不替代正式 MLR  

---

## 9. 持久化（香港 Postgres）

| 实体 | 表（示意） |
|------|------------|
| doing_now | `hcp_insights` JSONB 字段 |
| Options | `engagement_options` |
| Session | `chat_sessions`（含 mode、messages） |

与 Twin 共用 `DATABASE_URL`。

---

## 10. 包结构

```text
packages/hcp-engagement-agent/
  src/
    llm/          LlmClient + adapters
    tools/        五个 Capability
    graph/        propose 薄 LangGraph
    api/          synthesizeDoingNow, proposeOptions, chat, runComplianceGate
    prompts/      短 system + cn-hcp-pro 片段
    gate/         compliance_gate + failfast
```

依赖：`@hca/medical-kb` · `@hca/domain` · `@hca/db` · `openai` · `@langchain/langgraph` · `zod`

---

## 11. 环境变量

`DATABASE_URL` · `LLM_PROVIDER` · `LLM_MODEL` · `LLM_BASE_URL?` · `LLM_API_KEY?` · `DASHSCOPE_API_KEY?` · `DASHSCOPE_BASE_URL?` · `HCA_DATA_DIR?` · `LLM_TIMEOUT_MS?`

---

## 12. 验收（朱同玉）

- 同源 `doing_now` 可展示  
- Options 3–5 条 + 双引用 + 合规旁注  
- `open_chat` 为通用问答（不绑分身）；可讨论领域找人/合规等
- `revise_options` 可改该 HCP 当前方案
- 提案路径跳过 `retrieve_compliance` → 失败/拒答  

测试：Vitest mock `LlmClient`；CI 不强制 live Key。

---

## 13. feature-03 技术设计（AGT2-01 ROCKS，Sprint 2）

> 新增于 2026-10-21 开工准备批次。承接 [architecture §7](../architecture.md)（提示词版本化 · eval 门禁 · 时延预算 · 降级）与 [architecture §9](../architecture.md) ADR-2.0-6。功能编号 F-AGT-031 ~ 034，故事 [US-AGT-007 / 008](./agent-stories.md)。不新增对外 MCP 工具，交付面在 `packages/agent` 与 BFF 调用点。

### 13.1 模板版本化（F-AGT-031 / 032）

现状：四条路径的 system 模板为内联字符串常量（`propose.ts` / `revise.ts` / `synthesize.ts` / `chat.ts`）。

设计：

```text
packages/agent/src/prompts/
  v1/
    index.ts        # 导出 v1 模板注册表 { name, version, text }[]
```

- 模板只在编译期进 bundle，**不运行时读盘**；四个初始版本均为 v1，内容承接现状四个常量。
- 每个模板 `text` 按 ROCKS 五段以注释分节：`R=角色`、`O=目标`、`C=上下文`、`K=关键事实`、`S=输出要求`；五段齐全是版本合入的检查项。
- 修改模板 = 新增版本常量（如 `v2/`），旧版本保留在 git 历史，回滚 = revert 到上一版本；不提供运行时模板路由。
- 四个调用点改为从 `prompts/v1` 取模板；上下文注入策略不变（Insights 经 tool 注入，RAG 以 tool result 进入，不整包 Twin 入提示）。

### 13.2 评测门禁（F-AGT-033）

- 评测集：`packages/agent/eval/` 下固定 15 例（一人一策 5 · 开放对话 5 · 一句话洞察 5），每类至少 1 例以朱同玉 fixture 锚点；输入为 fixture 检索结果，不调生产库。
- 跑法：包内 `npm run eval:agent`，真实 LLM 走既有 `LLM_API_KEY` 环境变量（§11 列表，不新增 env 名）；eval 与 CI 解耦，opt-in 运行。
- 门槛：三类任务各 ≥ 4/5 例达标且无红线项（编造疗效、伪造引用、会话模式混用）即过门禁；任一红线 → 整批不过。
- 报告：`eval/` 内归档 JSON 摘要（不含密钥、不透传模型原始输出），作为变更合入的核验证据。
- 意义：不改对外契约；是模板/模型变更的合入前闸门（architecture §7 eval 门禁落地）。

### 13.3 时延预算与降级（F-AGT-034）

- 预算：Options 生成单次 ≤ 30 s，chat 首响应 ≤ 15 s；`LLM_TIMEOUT_MS` 语义不变，预算是其上的元数据层。
- 实测（2026-10-21 首跑 eval，qwen-max，[eval 报告](../../packages/hcp-engagement-agent/eval/reports/)）：propose 13–20 s、open_chat 5–11 s、synthesize 2–4 s，均在预算内；初值维持（30 s / 15 s），后续漂移超阈值再校准。
- 计时：`llm` 调用点到点 wrap `Date.now()`，写 `meta.latency_ms`（elapsed ms），超预算另记 `over_budget: true`。
- 降级：超时、无 Key、鉴权失败、限速 → Options/Insights 走既有 `ruleProposeOptions` / `ruleSynthesizeDoingNow`，chat 给固定致歉 + 修复提示文案；降级结果标 `degraded: true`，保留 `LLM_UNAVAILABLE` 错误码语义；不暴露堆栈与密钥。
- 计时与降级不改变 33 例既有测试断言的契约形状（字段只增不改）。

---

## 14. 相关文档

- 功能规格：[`agent-function-spec.md`](./agent-function-spec.md)  
- RAG 触发：[`../rag/rag-design.md`](../rag/rag-design.md)  
- Web：[`../app/app-function-spec.md`](../app/app-function-spec.md)  
- 安装：[`../4.install-dependencies.md`](../4.install-dependencies.md) §8  
