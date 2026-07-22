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
  → respond：返回用户 / 写 MySQL
```

---

## 3. 对外入口（BFF → 包）

| API | 触发 | 行为 |
|-----|------|------|
| `synthesizeDoingNow` | Twin 完成后 / `POST /api/insights/doing-now` | 写 `doing_now`（列表与洞察页**同源**） |
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
| `get_twin_insights` | 读 MySQL Insights | 不返回整包 twin |
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
  → 写 MySQL insights；metadata.llm
```

### B. 提案（薄 LangGraph）

```text
START
  → get_twin_insights
  → retrieve_academic ‖ retrieve_compliance
  → compliance_gate（无命中 → 降级/拒敏）
  → propose_engagement_options（LlmClient）
  → cn-hcp-compliance Fail-fast
  → persist options（MySQL）
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

## 9. 持久化（远程 MySQL）

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

## 13. 相关文档

- 功能规格：[`agent-function-spec.md`](./agent-function-spec.md)  
- RAG 触发：[`../rag/rag-design.md`](../rag/rag-design.md)  
- Web：[`../app/app-function-spec.md`](../app/app-function-spec.md)  
- 安装：[`../4.install-dependencies.md`](../4.install-dependencies.md) §8  
