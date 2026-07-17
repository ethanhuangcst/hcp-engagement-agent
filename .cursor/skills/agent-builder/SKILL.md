---
name: agent-builder
description: |
  Design and build AI agents for any domain. Use when users ask to create or
  refine hcp-engagement-agent, define agent capabilities/tools, design harness
  vs workflow, or understand agent architecture in this repo. Keywords: agent,
  assistant, capabilities, tools, LangGraph, hcp-engagement-agent, harness,
  tool use, multi-step, orchestration.
---

# Agent Builder

Build AI agents for any domain - customer service, research, operations, creative work, or specialized business processes.

## The Core Philosophy

> **The model already knows how to be an agent. Your job is to get out of the way.**

An agent is not complex engineering. It's a simple loop that invites the model to act:

```
LOOP:
  Model sees: context + available capabilities
  Model decides: act or respond
  If act: execute capability, add result, continue
  If respond: return to user
```

**That's it.** The magic isn't in the code - it's in the model. Your code just provides the opportunity.

## The Three Elements

### 1. Capabilities (What can it DO?)

Atomic actions the agent can perform: search, read, create, send, query, modify.

**Design principle**: Start with 3-5 capabilities. Add more only when the agent consistently fails because a capability is missing.

### 2. Knowledge (What does it KNOW?)

Domain expertise injected on-demand: policies, workflows, best practices, schemas.

**Design principle**: Make knowledge available, not mandatory. Load it when relevant, not upfront.

### 3. Context (What has happened?)

The conversation history - the thread connecting actions into coherent behavior.

**Design principle**: Context is precious. Isolate noisy subtasks. Truncate verbose outputs. Protect clarity.

## Agent Design Thinking

Before building, understand:

- **Purpose**: What should this agent accomplish?
- **Domain**: What world does it operate in? (customer service, research, operations, creative...)
- **Capabilities**: What 3-5 actions are essential?
- **Knowledge**: What expertise does it need access to?
- **Trust**: What decisions can you delegate to the model?

**CRITICAL**: Trust the model. Don't over-engineer. Don't pre-specify workflows. Give it capabilities and let it reason.

## Progressive Complexity

Start simple. Add complexity only when real usage reveals the need:

| Level | What to add | When to add it |
|-------|-------------|----------------|
| Basic | 3-5 capabilities | Always start here |
| Planning | Progress tracking | Multi-step tasks lose coherence |
| Subagents | Isolated child agents | Exploration pollutes context |
| Skills | On-demand knowledge | Domain expertise needed |

**Most agents never need to go beyond Level 2.**

## Domain Examples

**Business**: CRM queries, email, calendar, approvals
**Research**: Database search, document analysis, citations
**Operations**: Monitoring, tickets, notifications, escalation
**Creative**: Asset generation, editing, collaboration, review

The pattern is universal. Only the capabilities change.

## Key Principles

1. **The model IS the agent** - Code just runs the loop
2. **Capabilities enable** - What it CAN do
3. **Knowledge informs** - What it KNOWS how to do
4. **Constraints focus** - Limits create clarity
5. **Trust liberates** - Let the model reason
6. **Iteration reveals** - Start minimal, evolve from usage

## Anti-Patterns

| Pattern | Problem | Solution |
|---------|---------|----------|
| Over-engineering | Complexity before need | Start simple |
| Too many capabilities | Model confusion | 3-5 to start |
| Rigid workflows | Can't adapt | Let model decide |
| Front-loaded knowledge | Context bloat | Load on-demand |
| Micromanagement | Undercuts intelligence | Trust the model |

## Resources

**Philosophy & Theory**:

- [`references/agent-philosophy.md`](./references/agent-philosophy.md) - Deep dive into why agents work

**Implementation** (Python 示例，概念可移植至 TS/LangGraph.js):

- [`references/minimal-agent.py`](./references/minimal-agent.py) - Complete working agent (~80 lines)
- [`references/tool-templates.py`](./references/tool-templates.py) - Capability definitions
- [`references/subagent-pattern.py`](./references/subagent-pattern.py) - Context isolation

## The Agent Mindset

**From**: "How do I make the system do X?"
**To**: "How do I enable the model to do X?"

**From**: "What's the workflow for this task?"
**To**: "What capabilities would help accomplish this?"

The best agent code is almost boring. Simple loops. Clear capabilities. Clean context. The magic isn't in the code.

**Give the model capabilities and knowledge. Trust it to figure out the rest.**

---

## 本项目：hcp-engagement-agent（必读锚点）

| 文档 | 内容 |
|------|------|
| `knowledge/agent-hcp-engagement/design-direction.md` | 5 capabilities、轻 harness |
| `specs/3.architecture.md` §5.4 | Agent 编排与 Permissions |
| `specs/1.product-definition.md` | 产品链：Twin → Options → Assistant |
| `.cursor/skills/cn-hcp-pro/` | Engagement 策略与输出模板 |
| `.cursor/skills/cn-hcp-compliance/` | 生成后合规闸门 |

### 系统位置（勿混淆）

```text
感知层   hcp-twin-mcp        → Twin / Insights JSON
知识层   medical-kb (RAG)    → 学术 + 合规检索
决策层   hcp-engagement-agent ← 本文焦点
表达层   Web UI              → Options + Assistant
约束层   cn-hcp-compliance   → Fail-fast（不替代 MLR）
```

Agent **不是**爬虫、不是向量库；是决策与对话层。

### P0 Capabilities（仅 5 个，勿扩）

| Tool | 作用 |
|------|------|
| `get_twin_insights` | 读 Postgres `hcp_insights` |
| `retrieve_academic` | medical-kb → 专科过滤 |
| `retrieve_compliance` | **强制**；无命中则 gate |
| `propose_engagement_options` | 3–5 条 Options → JSON |
| `revise_engagement` | 对话修订；读/写 session |

有真实失败再加：on-demand ingest 触发、CRM 写入等。

### 薄 LangGraph（可接受编排）

```text
get_twin_insights
  → retrieve_academic ‖ retrieve_compliance
  → compliance_gate
  → generate_options（含 citations）
  → cn-hcp-compliance 检查
  → persist JSON
```

多轮修订由模型自主决定是否再检索；**不要**硬编码百步旅程。

### Knowledge 加载

| 来源 | 方式 |
|------|------|
| cn-hcp-pro 模板 | 短 system 或 @skill |
| RAG chunks | tool_result only |
| Twin | `get_twin_insights`；勿塞满 twin.json |
| 租户 SOP | compliance 检索 tenant 过滤 |

### Permissions

- 不编造说明书外疗效
- 院内活动旁注：机构同意 + 代表备案
- 输出 **不替代** MLR
- 仅公开信息进 Twin

### UI 映射

| UI | Agent |
|----|-------|
| Engagement Options | `propose_engagement_options` |
| Engagement Assistant | 同 Agent + `revise_engagement` |
| Insights 页 | 只读 Twin；可选解释建议依据 |
