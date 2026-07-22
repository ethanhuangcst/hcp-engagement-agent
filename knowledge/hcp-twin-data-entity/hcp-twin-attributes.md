---
title: HCP Virtual Twin 数据实体定义（属性规格）
type: entity-definition
status: active
as_of: 2026-07-16
tags:
  - hcp-virtual-twin
  - schema
  - profile
  - career
  - research
  - activity-heatmap
  - insights
related:
  - knowledge/mcp-hcp-virtual-twin/data-sources-zhu-tongyu.md
  - knowledge/hcp-twin-data-entity/bilingual-narrative-and-name-en.md
  - knowledge/agent-hcp-engagement/design-direction.md
  - knowledge/agent-hcp-engagement/china-hcp-engagement-research.md
  - knowledge/agent-hcp-engagement/glossary-abbreviations.md
  - specs/1.product-definition.md
  - specs/3.architecture.md
  - docs/adr/ADR-001-bilingual-narrative-buckets.md
  - docs/adr/ADR-002-latin-name-en-openalex.md
skills:
  - cn-hcp-pro
  - cn-hcp-compliance
  - research-ops
example_hcp:
  name: 朱同玉
  hospital: 复旦大学附属中山医院
  dept: 肾脏移植科 / 泌尿外科
---

# HCP Virtual Twin 数据实体定义

## 问题类型

- 补充性：定义 Twin 应包含哪些实体与属性，才能支撑一人一策 Insights 与 Engagement Options
- 比较性：各属性对洞察的价值、可自动化程度、合规风险

## 结论（先读）

HCP Virtual Twin（医疗专业人士数字分身）不是 CRM 客户卡，而是**可审计的公开信息结构化画像**。  
**按产品 UI 分类的权威摘要**见 [`twin-data-structure.md`](./twin-data-structure.md)（个人信息 / 职业轨迹 / 科研方向 / 著作荣誉 / 活动热力 / 兴趣 / 机会 / 证据）。

```text
VirtualTwin
├── profile (+ tags, author_ids)   # 个人信息
├── career                         # 职业轨迹
├── research.themes                # 科研方向
├── works | research pubs/honors   # 著作/荣誉
├── activity                       # 活动热力（更早|90|60|30）
├── insights.interest_directions   # 兴趣（原 cares_about）
├── insights.opportunities         # 机会（原 may_want）→ 一人一策
└── evidence_index                 # 证据和来源
```

每条事实字段须带 **`source` + `as_of` + `confidence`**。  
Twin **只收录公开信息**；不收录处方、统方、非公开 CRM 拜访、敏感健康数据。

---

## 1. 设计目的与边界

### 1.1 目的（对齐 cn-hcp-pro）

| 目的 | Twin 如何支撑 |
|------|----------------|
| 医生分层 | 专科、学术角色、机构层级、公开影响力信号 |
| 疾病旅程定位 | 临床专长、科研主题、演讲主题 |
| 一人一策主题 | themes、近期活动、政策 vs 学术分桶 |
| 渠道假设 | 活动形态、公开触点偏好（推断须标注） |
| 合规旁注 | 角色是否偏行政/政协；是否适合促销语境 |

### 1.2 合规边界（对齐 cn-hcp-compliance）

| 允许 | 禁止 |
|------|------|
| 医院/大学官网、学会、公开会议日程、PubMed、公开专利/基金公示、公开媒体采访 | 个人处方量、统方、非法商业数据 |
| 公开的学会任职、讲者角色、指南作者署名 | 未授权的私人联系方式用于营销画像（PIPL） |
| 用户在产品内主动录入的业务上下文（适应症边界等，存在租户侧，非 Twin 本体） | 把销量潜力当作 Twin 核心分层字段 |

**原则：** Twin = 人的公开学术/职业画像；产品/适应症/SOP 属于租户上下文，不写入 Twin 本体。

### 1.3 证据等级（每条记录通用）

| 字段 | 类型 | 说明 |
|------|------|------|
| `source_url` | string | 可点击溯源 |
| `source_type` | enum | `hospital_site` \| `university` \| `pubmed` \| `scholar` \| `orcid` \| `conference` \| `media` \| `patent` \| `funding` \| `user_input` \| … |
| `as_of` | date | 该证据采集日 |
| `confidence` | enum | `high` \| `medium` \| `low` |
| `evidence_snippet` | string? | 支撑摘录（短） |
| `conflict_note` | string? | 多源冲突时的裁决说明 |

置信度惯例（来自朱同玉数据源研究）：

- high：医院/大学主页、会议官方日程、PubMed 作者消歧后文献
- medium：二手转载、会议嘉宾页交叉验证
- low：仅标题提及、患者端聚合站、未消歧同名

---

## 2. 实体总览与落盘建议

与架构 `data/twins/{hcpId}/` 对齐（可拆文件，逻辑上仍是一个 Twin）：

| 逻辑模块 | 建议文件 | P0 |
|----------|----------|-----|
| Profile | `identity.json` + `profile` 段 | 是 |
| Career | `career-timeline.json` | 是 |
| Research | `research.json` | 是 |
| Activity | `heatmap/snapshots.json` | P1（监控） |
| Network / Content / HCO | 可并入 `twin.json` | 部分 P0 |
| Insights | `insights.json` | 是（衍生） |

---

## 3. Profile（HCP 基本画像）

身份锚点 + 可稳定复用的「人是谁」。

### 3.1 身份与消歧（Identity）

| 属性 | 类型 | 说明 | 洞察价值 | 优先级 |
|------|------|------|----------|--------|
| `hcp_id` | cuid | 系统主键 | 关联一切 | P0 |
| `name_zh` | string | 中文姓名 | 检索入口 | P0 |
| `name_en` / `name_variants[]` | string[] | 英文名及变体（Zhu Tongyu / Zhu TY） | 文献消歧 | P0 |
| `hospital` | string | 主执业医院 | 分层、准入语境 | P0 |
| `department` | string | 科室 | 专科映射 | P0 |
| `title_clinical` | string? | 临床职称（主任医师等） | 权威度 | P0 |
| `title_academic` | string? | 学术职称（教授等） | KOL/KME 判定 | P0 |
| `admin_roles[]` | RoleRef[] | 行政职务（副院长、学科带头人等） | 勿用促销话术；Gatekeeper | P0 |
| `external_ids` | ExternalIds | 文献检索号（ORCID / PubMed Author / Scholar / OpenAlex / Scopus 等）+ 医院专家页 ID；见数据字典 §3.2 | 消歧与拉论文 | P0 |
| `primary_urls[]` | {url, type, confidence} | 身份锚点 URL 集合 | 采集入口 | P0 |
| `disambiguation_status` | enum | `resolved` \| `ambiguous` \| `unresolved` | 未消歧禁止灌科研 | P0 |

**朱同玉样例（有来源）：** 姓名+中山医院+肾移植/泌尿 → 医院专家页、复旦 IMI 页；文献号至少已绑 Scholar `Yby_S-sAAAAJ`（ORCID / PubMed Author / OpenAlex 待 MCP 补全）。

### 3.2 专科与临床焦点（Specialty）

| 属性 | 类型 | 说明 | 洞察价值 | 优先级 |
|------|------|------|----------|--------|
| `specialties[]` | string[] | 规范专科标签（如 `kidney_transplant`） | RAG 按需 ingest 过滤 | P0 |
| `clinical_focus[]` | string[] | 临床专长叙述（移植、噬菌体感染等） | 内容主题 | P0 |
| `disease_areas[]` | string[] | 疾病领域（标准化更好） | 疾病旅程映射 | P0 |
| `patient_populations[]` | string[]? | 公开擅长的人群描述 | 路径设计 | P1 |
| `practice_settings[]` | enum[] | `tertiary` \| `secondary` \| `community` \| `research_lab` | 触达方式 | P0 |
| `hospital_tier` | string? | 医院等级/类型（公开） | 分层 | P0 |
| `city` / `province` | string? | 地理 | 区域会、县域策略 | P0 |

### 3.3 角色分层（Role Stratification）

按专科、学术影响力、诊疗场景分层——**不要**用处方潜力作核心字段（cn-hcp-pro 反模式）。

| 属性 | 类型 | 说明 | 洞察价值 | 优先级 |
|------|------|------|----------|--------|
| `role_labels[]` | enum[] | `kol` \| `kme` \| `frontline` \| `pharmacist` \| `nurse` \| `administrator` \| `policy_voice` | 选渠道与负责人 | P0 |
| `influence_scope` | enum? | `national` \| `regional` \| `local` \| `institutional` | 网络策略 | P1 |
| `mdt_roles[]` | string[]? | 公开 MDT 角色 | 跨科互动 | P2 |
| `teaching_roles[]` | string[]? | 研究生导师、继教讲者等 | 教育类 Engagement | P1 |
| `tags` | HcpTags | `hcp_tier` + `role_tags[]`；见 [`hcp-tagging.md`](./hcp-tagging.md) | 列表筛选、默认渠道 | P0 |

---

## 4. Career（职业轨迹）

时间轴上的「做过什么职务与训练」。

### 4.1 教育背景

| 属性 | 类型 | 说明 | 优先级 |
|------|------|------|--------|
| `education[]` | EducationRecord | 学位、院校、年份、专业 | P0 |

```text
EducationRecord {
  degree, institution, year?, field?, source, confidence, as_of
}
```

### 4.2 任职时间线

| 属性 | 类型 | 说明 | 洞察价值 | 优先级 |
|------|------|------|----------|--------|
| `positions_current[]` | PositionRecord | 现任：医院/大学/实验室/质控中心等 | 当前话语权 | P0 |
| `positions_past[]` | PositionRecord | 曾任（须与现任消歧） | 生涯叙事、人脉 | P0 |
| `society_roles[]` | SocietyRole | 学会主委/委员等 | KOL 网络、会务邀请 | P0 |
| `honors[]` | HonorRecord | 公开荣誉、人才计划 | 权威信号（降权使用） | P1 |
| `career_milestones[]` | Milestone | 关键节点（如建科、专项启动） | 故事化拜访主题 | P1 |

```text
PositionRecord {
  role, org, start_date?, end_date?, is_current,
  source, confidence, as_of, conflict_note?
}
```

**刷新：** 季度全量 + 新闻触发增量（履历变化慢）。

---

## 5. Research（科研动向）

「在研究什么、证据重心往哪移」。

### 5.1 文献与主题

| 属性 | 类型 | 说明 | 洞察价值 | 优先级 |
|------|------|------|----------|--------|
| `author_ids` | AuthorIds | 灌库权威副本：orcid、pubmed_author、google_scholar、openalex（P0）；scopus / WoS / S2 / CNKI 等（P1+）。`resolved` 时 ≥1 个 P0 号非空 | 正确灌论文 | P0 |
| `publication_stats` | object? | 公开页宣称的 SCI 数等（须标来源，可能滞后） | 概览 | P1 |
| `recent_pubs[]` | PubRecord | 近 12/24/36 月论文（PMID/DOI、标题、年份、MeSH） | 话题定制 | P0 |
| `themes[]` | ThemeTag | 聚类主题 + 权重 + 时间窗 | **核心洞察输入** | P0 |
| `trend_shift` | string? | 主题漂移简述（如「近年 AI+移植上升」） | MSL / 文献讨论 | P0 |
| `coauthors_top[]` | CoauthorRef[]? | 高频合作者（公开） | 网络与会务 | P2 |

```text
ThemeTag {
  theme_id, label_zh, label_en?, mesh[]?,
  window: "12m"|"24m"|"36m",
  weight, evidence_pub_ids[], as_of
}

PubRecord {
  pmid?, doi?, title, year, journal?,
  mesh[], keywords[], role_in_paper?,  // first/corresponding/co if known
  source_url, confidence
}
```

### 5.2 非论文科研信号

| 属性 | 类型 | 说明 | 洞察价值 | 优先级 |
|------|------|------|----------|--------|
| `funding[]` | FundingRecord | 国自然/重点专项等公示 | 真实投入方向 | P1 |
| `trials[]` | TrialRecord | CT.gov / 国内公开路径 | 研究合作型 Engagement | P1 |
| `patents[]` | PatentRecord | 公开专利 | 转化兴趣 | P1 |
| `lab_affiliations[]` | string[] | 重点实验室、研究所 | 资源与合作入口 | P0 |
| `active_projects[]` | ProjectBrief | 从新闻/基金合成的在研叙事 | 「想要什么」假设 | P1 |

每条非论文信号标记 `signal_type`: `funding` \| `trial` \| `patent` \| `news`。

**朱同玉主题样例（有来源研究归纳）：** 肾移植免疫/I-R、噬菌体、BK 病毒、近年 AI+移植。

---

## 6. Activity（活动热力）

近窗公开「出现在哪、谈什么」——产品差异化能力，也是工程瓶颈。

### 6.1 事件实体

沿用数据源研究中的 event schema，并扩展分桶：

```text
ActivityEvent {
  event_id, title,
  start_date, end_date?,
  city_or_venue?, organizer?,
  role: speaker|chair|panel|attendee|media|other,
  topic?,
  bucket: academic | policy_media | education | industry_forum | other,
  source_url, evidence_snippet, confidence,
  as_of
}
```

| 属性 | 类型 | 说明 | 洞察价值 | 优先级 |
|------|------|------|----------|--------|
| `events[]` | ActivityEvent[] | 原始事件列表 | 会后跟进主题 | P1 |
| `windows` | object | `{d30, d60, d90}` 切片统计与事件 ID | 节奏（NBT） | P1 |
| `heat_dimensions` | object? | 城市 × 主题 × 组织方 聚合 | 区域策略 | P1 |
| `no_public_evidence` | object? | 某窗口无公开证据时的显式标记 | 避免假热力 | P1 |
| `last_polled_at` | datetime | 监控水位 | 运维 | P1 |

**分桶规则（重要）：** 临床 KOL 兼行政/政协发声时，`policy_media` 与 `academic` 分开，避免把政策采访当成学术兴趣。

**刷新：** 每日新闻/会务检索 + 会前 30 天会议平台扫描（监控项，非一次性爬取）。

---

## 7. 其他有价值、能产生洞察的模块

以下模块是 Profile/Career/Research/Activity 的补充，直接服务 cn-hcp-pro 的「分层 + 旅程 + 渠道」。

### 7.1 Network（公开学术与诊疗网络）

| 属性 | 类型 | 说明 | 洞察价值 | 优先级 |
|------|------|------|----------|--------|
| `guideline_authorship[]` | DocRef | 指南/共识署名（公开） | 观念领导力 | P1 |
| `editorial_boards[]` | string[]? | 期刊编委等 | 学术话语权 | P2 |
| `advisory_public[]` | string[]? | 公开顾问/专家委员会（非药企私有 CRM） | 合作形态 | P2 |
| `key_collaborating_orgs[]` | string[] | 学会、质控中心、联合实验室 | 生态触点 | P1 |
| `mentees_or_team_signals` | string? | 公开团队/培养叙述（谨慎、降权） | 梯队教育 | P2 |

### 7.2 Content signals（内容与叙事偏好）

从公开演讲题目、采访、论文摘要推导，**标注为推断**。

| 属性 | 类型 | 说明 | 洞察价值 | 优先级 |
|------|------|------|----------|--------|
| `narrative_axes[]` | string[] | 反复出现的公开叙事（如 AI 医疗、看病难、耐药感染） | NBC | P0 |
| `preferred_formats_hypothesis[]` | enum[] | `deep_science` \| `guideline` \| `case` \| `policy` \| `digital_tool` | 渠道/形式假设 | P1 |
| `language_pref` | enum? | `zh` \| `en` \| `bilingual` | 物料语言 | P1 |
| `recent_quotes[]` | QuoteRef[]? | 公开采访金句（短+URL） | 拜访破冰（非促销） | P2 |

### 7.3 HCO context（机构与干系人语境）

Engagement 落地依赖 HCO Gatekeeper（医务/科教/药事等）——Twin 只存**公开机构事实**，不存内部关系网臆测。

| 属性 | 类型 | 说明 | 洞察价值 | 优先级 |
|------|------|------|----------|--------|
| `primary_hco` | HcoRef | 主机构名称、类型、城市 | 院内活动程序前提 | P0 |
| `affiliated_hcos[]` | HcoRef[] | 分院、大学、实验室挂靠 | 多点执业语境 | P1 |
| `public_gatekeeper_roles` | string[]? | 本人是否担任医务/行政相关公开职务 | 「谁审批」提示 | P0 |
| `department_public_channels[]` | url[]? | 科室官网、公众号（公开） | 热力监控源 | P1 |

### 7.4 Engagement-facing derived flags（衍生标志，非隐私）

供 Agent 快速分流，必须可解释：

| 属性 | 类型 | 说明 | 优先级 |
|------|------|------|--------|
| `suitable_for_promo_dialogue` | boolean + reason | 行政/政策向人物默认更谨慎 | P0 |
| `msl_priority_topics[]` | string[] | 适合 MSL 非促销深聊的主题 | P0 |
| `rep_priority_topics[]` | string[] | 仅在有说明书边界时由租户上下文填充主题占位 | P1 |
| `meeting_followup_hooks[]` | string[] | 近窗演讲题目 → 会后跟进钩子 | P1 |

> `rep_priority_topics` 不写死产品卖点；产品适应症来自租户，不进 Twin。

---

## 8. Insights（衍生洞察层）

Insights 不是另一套爬虫结果，而是对上述实体的**可解释综合**，供 UI 展示与 `get_twin_insights`。

### 8.1 建议结构

```text
HcpInsights {
  hcp_id, as_of, twin_version,

  doing_now: {           // 在做什么
    summary,
    active_themes[],
    active_roles[],
    evidence_refs[]
  },

  cares_about: {         // 对什么感兴趣
    themes_ranked[],
    narrative_axes[],
    academic_vs_policy_balance,
    evidence_refs[]
  },

  may_want: {            // 想要什么（假设，须标注推断）
    hypotheses[],        // 如：深度证据、研究合作、工具/路径、政策对话
    confidence,          // 整体置信
    do_not_assume[]      // 明确不应假设的项
  },

  engagement_hints: {    // 给 cn-hcp-pro 的短提示
    role_stratification,
    disease_journey_stage_hypothesis?,
    channel_preference_hypothesis[],
    stakeholder_notes[],
    compliance_cautions[]  // 如：院内须机构同意；勿促销话术打政策议题
  }
}
```

### 8.2 衍生规则（建议）

```text
兴趣点 ≈ 近窗论文主题 ∩ 近窗演讲主题 ∩（可选）政策发声主题
         —— 三桶分别计分，再交叉；政策桶不自动并入学术兴趣

趋势   ≈ themes(12m) vs themes(36m) 的增减

「想要什么」仅作假设：有基金/试验信号 → 研究合作假设；
         有工具/AI 叙事 → 数字化工作流假设；
         无证据 → 写入 do_not_assume 或低置信假设
```

---

## 9. 显式排除（勿写入 Twin）

| 数据 | 原因 |
|------|------|
| 处方量、份额、统方 | 《医药代表管理办法》负面清单；非法/高风险 |
| 非公开 CRM 拜访笔记冒充「活动热力」 | 伪造公开活动；合规与可信度双杀 |
| 患者病历、可识别患者故事 | PIPL；非 Engagement Twin 范围 |
| 未获单独同意的私人手机/微信号营销画像 | PIPL |
| 产品销量潜力评分作核心身份字段 | 分层反模式；属商业计划非 Twin |
| 未消歧同名文献 | 污染科研主题 |

租户侧可另存：`product_context`、`label_boundary`、`interaction_history`（客户自有、合规采集）——**与 Twin 分库/分目录**。

---

## 10. 属性优先级总表（落地用）

| 模块 | P0（朱同玉验收最小集） | P1 | P2 |
|------|------------------------|----|----|
| Profile | 姓名/医院/科室/职称/专科/角色标签/`external_ids`（文献号）/消歧状态 | 地理细化、教学角色 | MDT |
| Career | 教育、现任/曾任、学会任职 | 荣誉、里程碑 | — |
| Research | `author_ids`（≥1 P0 文献号）、recent_pubs、themes、trend_shift、实验室挂靠 | Scopus/WoS/CNKI 等 P1 号；基金、试验、专利 | 合作者网络 |
| Activity | —（可先空窗标记） | events + 90/60/30 + 分桶 + 监控 | 热力维度图 |
| Network | — | 指南署名、合作机构 | 编委、公开顾问 |
| Content | narrative_axes | 形式假设、语言 | 金句 |
| HCO | primary_hco、公开行政职务 | 附属机构、科室公开渠 | — |
| Insights | doing_now / cares_about / engagement_hints | may_want 细化 | — |

---

## 11. 与 Engagement Options 的字段映射

| Twin / Insights 信号 | Options 用法（cn-hcp-pro） |
|----------------------|----------------------------|
| `role_labels` + `influence_scope` | 选 KOL 网络动作 vs 一线教育 |
| `themes` + `trend_shift` | 内容主题；MSL 文献讨论 |
| `activity.events` 近窗题目 | 会后跟进、避免重复推送同题 |
| `bucket=policy_media` | 合规旁注：勿促销话术；可医学/政策对话隔离 |
| `admin_roles` / Gatekeeper | 写清「须机构同意」与审批路径提示 |
| `narrative_axes` | 破冰与 NBC |
| `msl_priority_topics` | 负责人=MSL，非促销 |
| `specialties` | 触发 medical-kb academic 按需 ingest |

每条 Option 仍须经 **cn-hcp-compliance** 闸门；Twin 再完整也不能替代 MLR。

---

## 12. 监控项（应持续，而非一次性研究）

| 信号 | 建议节奏 | 写入模块 |
|------|----------|----------|
| 会务/新闻活动 | 每日 + 会前 30 天 | Activity |
| 近 12 个月论文主题 | 每周增量 | Research.themes |
| 职业轨迹 | 季度全量 | Career |
| 文献检索号完整性（orcid / pubmed_author / scholar / openalex） | 构建时 + 季度 | `research.author_ids`（权威）与 `profile.external_ids` |

---

## 13. 证据边界

| 类型 | 内容 |
|------|------|
| 有来源 | 朱同玉数据源文档中的字段与 event schema；中国 Engagement 研究中的「统一画像」要素；架构中的 JSON 落盘约定 |
| 用户提供 | 产品定义要求 Twin 含个人信息、职业轨迹、科研、活动热力与 Insights |
| 推断 | Content signals、may_want、渠道偏好假设；热力公开覆盖不稳定 |
| 建议 | 采用本文模块化实体；P0 先 Profile+Career+Research+Insights；Activity 做监控；严格排除处方/统方/非公开 CRM |

## 14. Open questions

- [x] Twin JSON 字段与 event/career 对齐 → 见本文 §4–§8；P0 fixture：[`fixtures/zhu-tongyu.p0.json`](./fixtures/zhu-tongyu.p0.json)
- [ ] Zod 正式冻结（`packages/domain` 实现时从 fixture + [`5.hcp-twin-data-dictionary.md`](../../specs/5.hcp-twin-data-dictionary.md) 生成）
- [ ] `specialties` 受控词表（中英 + MeSH 映射）谁维护
- [x] 租户 `interaction_history` 与 Twin 分目录 → Twin 在 `data/twins/`，租户上下文在 `data/tenants/`（见 `specs/3.architecture.md` §7.3）
- [ ] 活动热力在国内会议平台的可程序化程度
- [x] 文献检索号码字段集 → 数据字典 §3.2 AuthorIds；fixture 已含 P0/P1 键

---

## 15. P0 JSON 样例（朱同玉）

完整 fixture 见 [`fixtures/zhu-tongyu.p0.json`](./fixtures/zhu-tongyu.p0.json)。  
落盘时可拆为 `identity.json` + `twin.json` + `insights.json`；fixture 为**逻辑合并视图**，便于评审与测试。

```text
data/twins/{hcpId}/
  identity.json     ← profile 身份锚点
  twin.json         ← profile + career + research + activity + network + content + hco + flags
  insights.json     ← insights（衍生，可独立版本号）
  career-timeline.json   （可选，大字段拆分）
  research.json          （可选）
  heatmap/snapshots.json （可选，activity 热力）
```

**schema_version**：`0.1.0-p0`；破坏性变更升 minor/major 并写迁移说明。

---

## 16. 相关文档

- 取数路径（朱同玉）：[`../mcp-hcp-virtual-twin/data-sources-zhu-tongyu.md`](../mcp-hcp-virtual-twin/data-sources-zhu-tongyu.md)
- Agent 设计：[`../agent-hcp-engagement/design-direction.md`](../agent-hcp-engagement/design-direction.md)
- 中国 Engagement 研究：[`../agent-hcp-engagement/china-hcp-engagement-research.md`](../agent-hcp-engagement/china-hcp-engagement-research.md)
- 架构：[`../../specs/3.architecture.md`](../../specs/3.architecture.md)
- P0 fixture：[`fixtures/zhu-tongyu.p0.json`](./fixtures/zhu-tongyu.p0.json)
- **数据字典（实现）**：[`../../specs/5.hcp-twin-data-dictionary.md`](../../specs/5.hcp-twin-data-dictionary.md)
