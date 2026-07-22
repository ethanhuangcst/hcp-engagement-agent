# HCP 数字分身数据结构（按产品 UI 分类）

> as_of：2026-07-16 · schema `0.1.5-p0`  
> 视角：cn-hcp-pro（一人一策）+ 产品 Tab：**数字分身** / **HCP洞察** / **一人一策**  
> 权威字段表：[`../../specs/5.hcp-twin-data-dictionary.md`](../../specs/5.hcp-twin-data-dictionary.md)  
> 实体 rationale：[`hcp-twin-attributes.md`](./hcp-twin-attributes.md) · 打标：[`hcp-tagging.md`](./hcp-tagging.md)

---

## 0. 结论（先读）

数字分身 JSON 按**业务可读分类**组织（非按技术文件名堆字段）。UI 与 Agent 消费时按下列 8 类取数；落盘仍可拆 `identity.json` / `twin.json` / `insights.json`。

```text
VirtualTwin
├── 1. 个人信息     profile + tags + author_ids
├── 2. 职业轨迹     career（教育/任职/学会）
├── 3. 科研方向     research.themes + trend_shift + labs
├── 4. 著作/荣誉    works（论文、专利、荣誉、认可）
├── 5. 活动热力     activity（更早|90|60|30）
├── 6. 兴趣         insights.interest_directions
├── 7. 机会         insights.opportunities（→ 一人一策输入）
└── 8. 证据和来源   evidence_index + 各字段 source_*
```

**禁止写入 Twin：** 处方量、统方、非公开 CRM、销量潜力分层。

---

## 1. 个人信息（数字分身 · 列表/详情头）

| 字段组 | JSON 路径 | UI | Engagement 用途 |
|--------|-----------|-----|-----------------|
| 身份 | `profile.name_*` / `hospital` / `department` / 职称 | 列表主列 | 检索、消歧 |
| 专科与临床 | `specialties` / `clinical_focus` / `disease_areas` | 详情 caption | RAG 按需 ingest、疾病旅程 |
| 级别标签 | `profile.tags.hcp_tier` + `role_tags[]` | 对比底色标签 | 默认渠道：T1→MSL；行政→慎促销 |
| 文献号 | `research.author_ids`（权威）/ `profile.external_ids` | mono 行 | 灌论文门禁 |
| 消歧 | `disambiguation_status` | 列表/门禁 | unresolved 禁灌科研 |
| 一句话洞察 | `insights.doing_now.summary` | 列表截断 + 详情摘要 | 访前 10 秒判断 |

---

## 2. 职业轨迹（数字分身 · 详情主脊）

| 字段组 | JSON 路径 | 说明 |
|--------|-----------|------|
| 教育 | `career.education[]` | 学位、院校、年份 |
| 现任/曾任 | `career.positions_current[]` / `positions_past[]` | 须消歧现任 |
| 学会 | `career.society_roles[]` | KOL 网络信号 |
| 行政 | `profile.admin_roles[]` | Gatekeeper；与促销语境隔离 |

时间轴 UI：左脊线 + 年代 mono。荣誉类见 §4，不堆在职业轴上刷屏。

---

## 3. 科研方向（HCP洞察）

| 字段组 | JSON 路径 | 说明 |
|--------|-----------|------|
| 方向列表 | `research.themes[]` | `label_zh`、`weight`、`window`、`theme_id` |
| 漂移 | `research.trend_shift` | 12m vs 36m 叙事 |
| 实验室 | `research.lab_affiliations[]` | 合作入口 |
| 方向下成果指针 | `themes[].achievement_refs[]` 或挂 `works` id | UI「每个方向下列主要成果」 |

**cn-hcp-pro：** 方向 = 内容主题候选；weight 高 + 近窗活动同题 → P0 拜访主题。

---

## 4. 著作 / 荣誉（HCP洞察 · 挂在科研方向下或独立块）

模块名：`works`（可由 research/career 字段聚合视图）。

| 字段组 | JSON 路径 | 类型示例 |
|--------|-----------|----------|
| 论文 | `works.publications[]` 或 `research.recent_pubs[]` | PMID/DOI、标题、年 |
| 统计宣称 | `research.publication_stats` | 须标来源，展示降权 |
| 专利 | `works.patents[]` / `research.patents[]` | 公开专利 |
| 荣誉 | `works.honors[]` / `career.honors[]` | 人才计划、奖项 |
| 认可 | `works.recognitions[]` | 指南署名、质控职务等公开认可 |

每条须 `source_url` + `confidence` + `as_of`。

---

## 5. 活动热力（HCP洞察 · 四列表）

| 字段组 | JSON 路径 | UI |
|--------|-----------|-----|
| 事件 | `activity.events[]` | 日期、地点、名称（链接）、role、bucket |
| 时间窗 | `activity.windows` | **更早** / `d90` / `d60` / `d30` |
| 空窗 | `no_public_evidence: true` | 不绘假高峰 |
| 分桶 | `bucket`: academic \| policy_media | 政策发声勿当学术兴趣 |

---

## 6. 兴趣（HCP洞察 ·「兴趣方向」）

原 `insights.cares_about` → 规范名 **`insights.interest_directions`**（兼容别名 `cares_about`）。

| 字段 | 说明 |
|------|------|
| `axes[]` | 兴趣轴：标题 + 分析短文 + 证据 refs |
| `academic_vs_policy_balance` | 分桶提醒 |
| `channel_preference_hypothesis[]` | 渠道假设（须标推断） |
| `role_stratification` | 分层摘要（KOL/行政等） |
| `compliance_cautions[]` | 旁注，非警报刷屏 |

**不是**购物车式「喜欢什么药」；是公开语料上的议题兴趣。

---

## 7. 机会（HCP洞察 ·「可能的机会」→ 一人一策输入）

原 `insights.may_want` → 规范名 **`insights.opportunities`**（兼容别名 `may_want`）。

| 字段 | 说明 |
|------|------|
| `items[]` | 每条：标题、分析、建议负责人/渠道、优先级、成功信号草稿 |
| `confidence` | 整体置信 |
| `do_not_assume[]` | 禁止写进 Option 的假设（处方、进院、产品绑定） |
| `suitable_for_promo_dialogue` | 来自 `engagement_flags` |

一人一策 Options 由 Agent 把 `opportunities` 落成正式 Option 字段（动作/负责人/渠道/主题/信号/合规旁注）。

---

## 8. 证据和来源（HCP洞察 · 表）

| 字段组 | JSON 路径 | UI |
|--------|-----------|-----|
| 索引表 | `evidence_index[]` | 来源名（可点链接）、置信、as_of |
| 内联 | 任意事实上的 `source_url` / `source_type` | 行内链接 |

---

## 9. 与三个产品 Tab 的映射

| Tab | 主要消费分类 |
|-----|----------------|
| **数字分身** | §1 个人信息（列表）+ §1 一句话洞察 + §2 职业轨迹 + 标签 |
| **HCP洞察** | §1 摘要 + §3 科研方向 + §4 著作/荣誉 + §5 活动热力 + §6 兴趣 + §7 机会 + §8 证据 |
| **一人一策** | §7 机会为主输入；§1 标签与 §6 合规旁注约束默认渠道/负责人 |

---

## 10. 证据边界

| 类型 | 内容 |
|------|------|
| 有来源 | 产品 UI 信息架构；朱同玉 fixture；cn-hcp-pro 分层与合规旁注原则 |
| 推断 | 兴趣轴分析文案、机会优先级 |
| 建议 | JSON 键迁移：`interest_directions` / `opportunities` / `works`；旧键作别名一版 |
