# hcp-engagement-agent 构建初始提示词

> 用途：启动「设计 / 实现 `packages/hcp-engagement-agent`」时的 STAR 提示。  
> 约束权威：[`agent-function-spec.md`](./agent-function-spec.md)、[`../3.architecture.md`](../3.architecture.md) §5.4、[`../../knowledge/agent-hcp-engagement/design-direction.md`](../../knowledge/agent-hcp-engagement/design-direction.md)、**agent-builder**、cn-hcp-pro、cn-hcp-compliance。  
> as_of：2026-07-16

---

# S — Situation

我是药企中国市场 **HCP Engagement** 团队成员。需要在合规边界内，为指定 HCP（多为医生）做访前准备与一人一策，而不是通用营销文案。

已有系统边界（勿重建、勿越界）：

| 层 | 组件 | 职责 |
|----|------|------|
| 感知 | `hcp-twin-mcp` | 公开信息 → Twin / Insights JSON（职业轨迹、科研、活动热力、tags 等） |
| 知识 | `medical-knowledge-base` | 双索引 RAG：学术 ‖ 合规；按专科按需检索 |
| 决策 | **`hcp-engagement-agent`（本任务）** | 一句话洞察文案、Engagement Options、对话修订 |
| 表达 | Web App | 数字分身 / HCP洞察 / 一人一策 / Agent Tab；浏览器只调 BFF |

验收样例 HCP：复旦大学附属中山医院 **朱同玉**。

产品缺口对齐行业现实：有 CRM ≠ 知道此刻该聊什么。Agent 要把 Insights 编成**可执行、带合规旁注、可对话迭代**的一人一策。

---

# T — Task

设计并（按规格）实现 **`hcp-engagement-agent`**（包名建议 `@hca/hcp-engagement-agent`），使其成为系统的**决策与对话层**。

必须交付（与 [`agent-function-spec.md`](./agent-function-spec.md) 一致）：

1. **Purpose 清晰**：中国合规边界内，基于 Twin Insights 生成/迭代 Personalized Engagement Options；并合成可审计的一句话洞察；支持 Agent Web UI 对话。
2. **Harness 轻量**：模型即智能体；代码提供 Capabilities + Knowledge 按需注入 + Context 保护 + Permissions。**先 5 个 Capability，勿先做刚性多节点工作流或 20+ tools。**
3. **包级能力**（BFF 可调）  
   - `synthesizeDoingNow`：写 `insights.doing_now`（数字分身与 HCP 洞察**同源**）  
   - `proposeOptions`：3–5 条 Options（含学术/合规引用）  
   - `chat`：`mode=open_chat`（Agent Tab）\| `mode=revise_options`（一人一策页底）  
   - `runComplianceGate`：Fail-fast（不替代正式 MLR）
4. **P0 Tools（仅 5 个）**  
   `get_twin_insights` · `retrieve_academic` · `retrieve_compliance`（提案路径**强制**）· `propose_engagement_options` · `revise_engagement`
5. **LLM**：后台 `LlmClient` 适配层；**默认 Qwen（DashScope）**；配置可切换 OpenAI 兼容提供方；Key 不进浏览器。
6. **持久化**：Options / sessions 写入香港 **Postgres**；与 Twin 共用 `DATABASE_URL`（见架构 / 安装规格）。

非目标（明确不要做）：爬虫/Playwright、自建向量库、多 Agent 路由、自动办会、CRM 回写、替代 MLR、无处方/统方数据。

---

# A — Action Role

你同时扮演：

1. **Agent Builder**（遵循 agent-builder）  
   - 信任模型推理；Capabilities 启用行为，Knowledge 按需加载，Context 保清晰。  
   - 反模式：过度工程、工具膨胀、硬编码百步旅程、把整库/全文 skill 塞进 system prompt。

2. **中国市场 HCP Engagement 专家**（对齐 cn-hcp-pro）  
   - 熟悉分层、疾病旅程、全渠道（拜访/企微/科室会/MSL 等）、KOL–KME–基层与 HCO 语境。  
   - 对以下企业在华 Engagement 实践有判断力（作参照，非照搬话术）：阿斯利康、辉瑞、拜耳、默沙东、赛诺菲、诺华、诺和诺德、礼来、GSK。

3. **合规闸门意识**（对齐 cn-hcp-compliance）  
   - 生成前强制合规检索；院内活动旁注机构同意与代表备案；不编造说明书外疗效；输出辅助建议，**不替代**正式 MLR。

输出与实现时的行文：平实、克制、术语稳定；遵守仓库用户规则中的「语言与写作风格」（此处不重复粘贴全文）。不用 emoji 堆砌，不用口号式营销腔。

---

# R — Rules（设计与实现硬约束）

## R1. 能力边界（对应产品入口）

| 模式 | 入口 | 行为 |
|------|------|------|
| 一句话洞察 | 后台 / Twin 完成后 | `synthesizeDoingNow` → `doing_now.summary` + 可选 `analysis` |
| 提案 | 一人一策「生成方案」 | 薄编排：Insights → 学术‖合规检索 → gate → Options → 合规检查 → 写入 Postgres |
| Chat · 开放 | Agent Web UI | `open_chat`：**通用** Agent；不强制 `hcpId`/Option；不默认 Twin |
| Chat · 修订 | 一人一策页底 | `revise_options`：必须绑当前方案；优先 `revise_engagement` |

旧称「insight / chat」两种能力：**拆成上表四条路径**；其中「完整洞察分析」的事实层来自 Twin/MCP，Agent 负责**文案合成与 Engagement 决策**，不要把 Agent 做成第二套爬虫。

## R2. agent-builder 原则

```text
LOOP:
  模型看到：短 system + 会话 + tool_results
  模型决定：调用 capability 或回复用户
  若 act：执行 → 结果写入 context → 继续
  若 respond：返回 Options / 修订稿 / 对话答复 → 写入 Postgres
```

- Knowledge：cn-hcp-pro 模板短载入；RAG 仅经 `retrieve_*` 的 tool_result；Twin 经 `get_twin_insights`，勿塞满 `twin.json`。
- 提案主路径可用**薄** LangGraph；对话路径**不**强制重跑全图。
- 有真实失败再加第 6 个 Tool；`synthesizeDoingNow` 保持包级 API，不占 Tools 名额。

## R3. Permissions

- 仅使用公开 Twin 信息与租户合规/产品上下文（产品上下文**不写入** Twin 本体）。
- 禁止处方量、统方、非公开 CRM 作为分层或主题依据。
- Options 字段对齐 UI：动作 / 负责人 / 渠道 / 主题 / 成功信号 / 合规旁注 / 优先级 + `academic_refs` / `compliance_refs`。
- 消费 `profile.tags`（如 T1→偏 MSL；行政/政策→慎促销）。

## R4. 实现与文档

- Schema first：Zod 入参；结构化错误（见 agent-function-spec）。
- 实现批次默认 TBD；先契约与 mock `LlmClient`，再 live Qwen。
- 设计结论须可追溯到 `agent-function-spec` / 架构 §5.4；若提案变更规格，先改规格再改代码。

## R5. 验收（最小）

- 朱同玉：可生成同源一句话洞察；Options 3–5 条且含双引用与合规旁注；`revise_options` 可改当前方案。  
- `open_chat`：通用对话（如领域找人）不依赖当前打开的分身；历史与正文本机可恢复。
- `retrieve_compliance` 在提案路径不可被跳过；无合规命中时对敏感动作降级或拒答并说明原因。

---

# 开始时请你先做

1. 用不超过 10 行复述 Purpose、系统位置、5 Tools、非目标。  
2. 指出与本文冲突的任何既有草稿，以 **agent-function-spec + agent-builder** 为准提出修订。  
3. 再展开设计或实现步骤（先规格对齐，再代码）。
