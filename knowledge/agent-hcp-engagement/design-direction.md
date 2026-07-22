---
title: hcp-engagement-agent 设计方向
type: architecture-decision
status: active
as_of: 2026-07-16
tags:
  - hcp-engagement-agent
  - agent-builder
  - cn-hcp-pro
  - cn-hcp-compliance
related_spec: specs/initial.req.md
related:
  - knowledge/hcp-twin/hcp-twin-attributes.md
  - knowledge/agent-hcp-engagement/china-hcp-engagement-research.md
  - knowledge/mcp-hcp-virtual-twin/data-sources-zhu-tongyu.md
  - knowledge/rag-medical-knowledge-base/rag-architecture.md
  - knowledge/rag-medical-knowledge-base/on-demand-ingest.md
skills:
  - cn-hcp-pro
  - cn-hcp-compliance
project_skills: .cursor/skills/
  # cn-hcp-pro, cn-hcp-compliance, rag-implementation, mcp-server-patterns, agent-builder
---

# hcp-engagement-agent 设计方向

## 问题类型

- 补充性 / 比较性：解读初始需求，给出智能体 harness 设计方向
- 基准日：**2026-07-16**

## 证据

### 用户提供的上下文（初始需求）

`specs/initial.req.md` 定义的是一条产品链，不是单点聊天机器人：

| 模块 | 职责 |
|------|------|
| Web UI | Twin 录入 → Insights 展示 → Engagement Options → 对话式 Assistant |
| `hcp-twin-mcp` | 公开信息检索 → 本地 Twin JSON → Insights（轨迹/科研/热力/兴趣） |
| `medical-knowledge-base` RAG | 专科前沿学术 + Engagement 合规 |
| `hcp-engagement-agent` | Twin Insights + 学术 RAG + 合规 RAG → 个性化方案 |
| 验收样例 | 复旦大学附属中山医院朱同玉教授 |

### 仓库已沉淀的设计结论

- Twin：职业轨迹 / 科研 / 活动热力分 collector；热力需持续监控（见 `mcp-hcp-virtual-twin/`）
- RAG：双索引（academic / compliance）+ 按专科按需灌注，非全科预灌（见 `rag-medical-knowledge-base/`）
- 中国市场：Engagement 从「场次」转向「合规 × 全渠道 × 疾病旅程」；代表日常一人一策是空白带（见 `china-hcp-engagement-research.md`）
- 技能：`cn-hcp-pro`（策略）+ `cn-hcp-compliance`（闸门）

### agent-builder 原则

智能体 = 模型；代码 = harness（Capabilities + Knowledge + Context + Permissions）。  
先 3–5 个能力，勿先做刚性多节点工作流图。

---

## 推论：智能体在系统中的位置

`hcp-engagement-agent` 是**决策与对话层**，不是爬虫层，也不是向量库本身。

```text
感知层   hcp-twin-mcp → Twin / Insights
知识层   medical-KB（学术 ‖ 合规）按需检索
决策层   hcp-engagement-agent  ← 本文焦点
表达层   Options UI + Assistant 对话
约束层   cn-hcp-compliance（Fail-fast）+ 正式 MLR（人）
```

产品卖点对齐行业缺口：**有 CRM ≠ 知道此刻聊什么**。  
Agent 要把 Insights 编成可执行、带合规旁注的一人一策。

---

## 设计方向

### 1. Purpose（一句话）

在中国合规边界内，基于某位 HCP 的 Twin Insights，生成并迭代**个性化 Engagement Options**（拜访 / 企微 / 科室会 / MSL 等），而不是通用营销文案生成器。

### 2. 最小 Capabilities（P0：5 个）

| Capability | 作用 |
|------------|------|
| `get_twin_insights` | 读本地 Twin JSON / Insights |
| `retrieve_academic` | 按 specialty / themes 检索学术索引 |
| `retrieve_compliance` | **强制**检索合规索引（生成前不可跳过） |
| `propose_engagement_options` | 输出 3–5 条 Options（字段对齐 cn-hcp-pro） |
| `revise_engagement` | 在对话中按用户反馈改 Options |

后续再加（有真实失败再加）：触发专科 on-demand ingest、写 CRM、查备案状态等。

### 3. Knowledge（按需加载，勿塞满 system prompt）

| 知识 | 加载方式 |
|------|----------|
| cn-hcp-pro 工作流 / 输出模板 | Skill 或短 system |
| cn-hcp-compliance Fail-fast | 生成后闸门或并行检查 |
| RAG chunks | tool_result，带引用 |
| Twin Insights | tool_result |
| 客户 SOP | 租户隔离；冲突取更严 |

### 4. 编排：轻 harness，重模型

- **推荐：** 简单 agent loop + 上述 tools；合规检索为硬约束（无合规命中 → 降级 / 拒答敏感动作）。
- **可接受的薄编排：**「读 Twin → 并行双检索 → 生成 → 合规检查」四步；多轮修订由模型决定。
- **避免：** 一开始就做复杂多 Agent 路由、几十个工具、硬编码百步旅程。

### 5. Permissions（边界）

- 不编造说明书外疗效；无说明书则只谈疾病 / 学术主题与程序前提
- 院内活动必须旁注「机构同意 + 代表备案」
- 输出是辅助建议，**不替代**正式 MLR
- 仅公开信息进 Twin；不接入非法统方 / 处方数据

### 6. UI 与 Agent 的对应

| UI | Agent 行为 |
|----|------------|
| Engagement Options | 一次性 `propose_engagement_options`（主路径） |
| Engagement Assistant | 同一 Agent + `revise_engagement`，上下文含上一轮 Options |
| Insights 页 | 只读 Twin；Agent 可选「解释为何这样建议」 |

### 7. 对初始需求表述的设计修正

| 需求原文 | 设计修正 |
|----------|----------|
| 「全科医学知识库」 | 改为**专科按需** academic 索引 |
| 「全网爬虫」建 Twin | 分源 collector + AuthorIds 绑定后灌文；热力异步监控 |
| 单一「推荐方案」 | Options 多选 + 对话迭代 + 合规旁注 |

---

## 建议落地顺序

**P0 智能体形态**

`hcp-engagement-agent` = cn-hcp-pro 人设 + 5 tools（Twin / 学术 / 合规 / 提案 / 修订）+ 双索引 RAG + 合规强制检索；验收用例朱同玉。

**不要先做**

全渠道中台、自动办会、自动支付讲课费、替代 MLR。

## 监控项

| 对象 | 节奏 |
|------|------|
| 《医药代表管理办法》实施细则与医院接待落地 | 2026-08 起每月 |
| 合规检索命中率 / Fail-fast 触发率 | 上线后周看 |
| Options 被采纳 / 对话修订率 | 上线后月看 |

## 证据边界

| 类型 | 内容 |
|------|------|
| 用户提供 | `specs/initial.req.md` |
| 有来源 / 已沉淀 | Twin、RAG、中国 Engagement 研究文档；Veeva 等见 china 研究报告 |
| 推断 | 「一人一策 Agent 对齐行业下一高地」 |
| 建议 | 5 capabilities + 强制合规检索 + 轻 harness |

## Open questions

- [x] Twin JSON 正式字段 → [`../hcp-twin/hcp-twin-attributes.md`](../hcp-twin/hcp-twin-attributes.md)
- [ ] Options schema 正式字段冻结
- [ ] 合规闸门是 Agent 内 tool，还是生成后独立 `cn-hcp-compliance` 步骤
- [ ] 客户 SOP 多租户隔离实现位置（RAG metadata vs 应用层）
