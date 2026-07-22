---
title: HCP Virtual Twin 信息获取路径 — 朱同玉样例
type: research-synthesis
status: active
as_of: 2026-07-16
tags:
  - hcp-virtual-twin
  - hcp-twin-mcp
  - data-sources
  - zhu-tongyu
  - fudan-zhongshan
related_spec: specs/1.product-definition.md
related:
  - knowledge/hcp-twin/hcp-twin-attributes.md
  - knowledge/hcp-twin/fixtures/zhu-tongyu.p0.json
  - knowledge/hcp-twin/hcp-tagging.md
  - specs/5.hcp-twin-data-dictionary.md
example_hcp:
  name: 朱同玉
  hospital: 复旦大学附属中山医院
  dept: 肾脏移植科 / 泌尿外科
---

# HCP Virtual Twin 信息获取路径（朱同玉样例）

## 问题类型

- 补充性：如何为 HCP Virtual Twin 获取职业轨迹、科研动向、活动热力
- 比较性：各信息源可靠度与可自动化程度

## 用户上下文

- 产品需内建 `hcp-twin-mcp`，全网检索 HCP 信息并生成本地 Twin JSON 与 Insights
- 典型用例：复旦大学附属中山医院朱同玉教授（见 `specs/initial.req.md`）

---

## 1. 职业轨迹（Career Timeline）

### 1.1 数据源优先级

| Priority | Source type | Example (Zhu) | Extract |
|----------|-------------|---------------|---------|
| P0 | 医院/科室官网简介 | https://www.transplantation.com.cn/zh_CN/专家介绍/ | 现任职称、学科角色、学会任职、临床专长、里程碑 |
| P0 | 大学/研究院页 | https://imi.fudan.edu.cn/info/1216/1053.htm | 教育背景、入职时间、现任/曾任职务、社会兼职 |
| P1 | 会议嘉宾页 | https://tss2024.sciconf.cn/cn/minisite/guest-info/24435?nid=37323 | 标准化 bio，用于交叉验证 |
| P2 | 患者端聚合站 | https://www.haodf.com/doctor/14778.html | 门诊科室、擅长（降权，易滞后） |

### 1.2 有来源的事实（骨架）

- 1994 上海医科大学外科学博士；1994.11 参加工作
- 现任：复旦上海医学院副院长；中山医院肾移植学科带头人；上海市器官移植重点实验室主任；上海市肾移植质控中心主任；噬菌体相关研究所所长等
- 曾任：申康、公卫中心、中山青浦分院、中山厦门医院执行院长等（多源一致）
- 学会角色：上海医学会器官移植分会、中国医师协会器官移植分会等（各页“现任/前主任委员”表述需消歧）

### 1.3 获取方法（hcp-twin-mcp）

1. 身份锚点：`姓名 + 医院 + 科室` → 主页 URL 集合
2. 结构化抽取：教育 / 现任 / 曾任 / 学会 / 荣誉 → `{date?, role, org, source, confidence}`
3. 冲突裁决：医院/大学页 > 会议嘉宾页 > 聚合站
4. 刷新策略：季度全量 + 新闻触发增量（履历变化慢）

---

## 2. 科研动向（Research Trajectory）

### 2.1 信号层与来源

| Layer | Source | Automation | Zhu themes |
|-------|--------|------------|------------|
| 论文 | PubMed E-utilities、Google Scholar、ORCID / PubMed Computed Authors | High | 肾移植免疫/I-R、噬菌体、BK 病毒、近年 AI+移植 |
| 基金/专项 | 国自然/国家重点研发公示、医院新闻 | Medium | 卫健委前沿生物技术重点专项、传染病重大专项等 |
| 临床研究 | ClinicalTrials.gov、国内备案/医疗技术路径报道 | Medium–Low | 噬菌体治疗常走国内路径，未必出现在 CT.gov |
| 转化/产业 | 专利、深度媒体 | Medium | 噬菌体所、成果转化、政策提案 |
| 即时叙事 | 科室站、两会采访 | Medium | AI 医疗、可信数据空间、看病难等 |

Scholar 样例：https://scholar.google.com/citations?user=Yby_S-sAAAAJ

### 2.2 有来源的事实（画像）

- 科室页：SCI 约 280+；Nature Medicine / Nat Commun 等；专利 11（授权 5）；国重/国自然等 30+ 项
- 公开叙事主轴：肾移植临床 + 噬菌体抗耐药感染 + BK 病毒 +（近年）AI/智能体在移植与科室管理（如 Youmed、“易知”）

### 2.3 文献检索号码（写入 Twin `author_ids` / `external_ids`）

分身必须落盘论文检索用标识符（数据字典 §3.2）。优先级：

| 优先级 | 字段 | 朱同玉样例 |
|--------|------|------------|
| P0 | `orcid` | 待 live 消歧 |
| P0 | `pubmed_author` | 待 live 消歧（NCBI Computed Authors） |
| P0 | `google_scholar` | `Yby_S-sAAAAJ` |
| P0 | `openalex` | 待 live 消歧 |
| P1 | `scopus_author_id` / `wos_researcher_id` / `semantic_scholar` / `cnki_scholar` | 有则写入 |

`disambiguation_status=resolved` 时，上述 P0 四字段至少填一。禁止仅按中文姓名灌库。

### 2.4 获取方法

1. **作者消歧（关键）**：绑定 §2.3 号码；辅助查询串 = `name_en`/`name_variants` + `Fudan`/`Zhongshan`
2. 论文时间窗：近 36/24/12 个月 → MeSH/关键词聚类 → 动向标签
3. 非论文信号：基金、试验、专利、医院科研新闻 → 标记 `funding | trial | patent | news`
4. 建议输出：`author_ids`、`themes[]`、`recent_pubs[]`、`active_projects[]`、`trend_shift`

---

## 3. 活动热力图（90 / 60 / 30 天）

### 3.1 难度结论

三类信息中最难：无统一“医生参会 API”，公开信号分散且滞后。必须持续监控，不能依赖单次全网爬虫。

### 3.2 数据源

| Source | Yield | Example |
|--------|-------|---------|
| 科室/医院官网新闻 | 日期、地点、角色、主办方 | https://www.transplantation.com.cn/（如 2025 肾移植 AI 前沿论坛） |
| 会议平台日程 | 会场/题目/主办学会 | SciConf、cnconf 讲者日程 |
| 学会/协会稿件 | 分会场报告 | 南粤移植论坛等 |
| 主流/行业媒体 | 两会、峰会、政策发声 | 人民论坛网、科学网等 |
| 微信公众号 / 丁香园 | 会后通稿 | 常与官网互链 |

### 3.3 Event schema

```json
{
  "event_id": "string",
  "title": "string",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "city_or_venue": "string",
  "organizer": "string",
  "role": "speaker|chair|panel|media",
  "topic": "string",
  "source_url": "string",
  "evidence_snippet": "string",
  "confidence": "high|medium|low"
}
```

按 `as_of` 切 90/60/30 天；热力维度建议：城市 × 主题 × 组织方。

### 3.4 相对 2026-07-16 的窗口现实

| Window | Public evidence (Zhu) |
|--------|------------------------|
| ~90d (≥2026-04-17) | 可见媒体深度稿（科研叙事，≠参会）；带日期地点主办方的会务通稿不足 |
| ~120–150d (2026-03) | 两会相关采访/提案报道较密（政策场景） |
| Older but verified | 2025-06 肾移植 AI 论坛（上海中山，主席）；2025-08 噬菌体大会（共同主席）；2025-12 南粤移植论坛演讲等 |

置信度规则：日程页/官网通稿 = high；二手转载 = medium；仅标题提及 = low。  
合规：仅用公开信息；不采集非公开 CRM/拜访记录冒充活动。

对“临床 KOL + 行政/政协”人物，热力应分桶：`academic` vs `policy_media`，避免一律当成学术兴趣。

---

## 4. 推论

1. 职业轨迹：公开网页即可达可用 Twin 质量；难点是职务时间戳与现任/曾任消歧。
2. 科研动向：以 PubMed/Scholar 结构化数据为主，医院新闻与基金为辅；中文 KOL 必须作者消歧。
3. 活动热力：产品差异化能力与工程瓶颈；需持续监控 + 多源融合；30 天空窗应显式标记 `no_public_evidence`。

---

## 5. 建议：hcp-twin-mcp 交付顺序

```text
Stage A 身份锁定
  姓名+医院+科室 → 主页URL + AuthorIds
  写入 external_ids / author_ids：
    P0: orcid | pubmed_author | google_scholar | openalex（≥1）
    P1: scopus_author_id | wos_researcher_id | semantic_scholar | cnki_scholar …
  写入 profile.tags（简单级别打标，见 hcp-tagging.md）：
    hcp_tier: T1|T2|T3|unclassified
    role_tags[]: kol|kme|administrator|…（规则优先）

Stage B 职业轨迹 (P0, 可先交付)
  医院/大学页 → timeline JSON

Stage C 科研动向 (P0)
  按 author_ids 优先级拉文（见数据字典 §3.2.3）
  → 近 36/24/12 月主题聚类 + 基金/专利/新闻补强
  禁止仅中文姓名灌 PubMed

Stage D 活动热力 (P1, 需监控)
  科室站+会议平台+新闻；按更早/90/60/30 切片（表格式展示）

Stage E Insights
  一句话洞察 + 科研方向/成果 + 兴趣点
  = 近期论文主题 ∩ 近期演讲主题 ∩ 政策发声主题
```

### 监控建议（应设为监控项）

| Signal | Cadence |
|--------|---------|
| 活动热力新闻/会务 | 每日检索 + 会前 30 天会议平台扫描 |
| 科研近 12 个月主题 | 每周论文增量 |
| 职业轨迹 | 季度全量 |

---

## 6. Evidence boundary

| Kind | Content |
|------|---------|
| 有来源的事实 | 上文带 URL 的履历、论文平台、会务通稿、两会媒体 |
| 用户提供的上下文 | `specs/initial.req.md` 产品范围与朱同玉用例 |
| 推断 | 90 天热力公开覆盖不稳定；政策活动需与学术活动分桶 |
| 建议 | MCP 分 Stage 交付；活动热力做成 cron 监控而非一次性爬取 |

## 7. Open questions

- [ ] 朱同玉 ORCID / PubMed Author / OpenAlex 是否可稳定解析并写入 `author_ids`（当前 fixture 仅绑定 Scholar）
- [ ] 国内会议平台（SciConf/cnconf）讲者检索是否可稳定程序化
- [x] Twin JSON 正式 schema → [`../hcp-twin/hcp-twin-attributes.md`](../hcp-twin/hcp-twin-attributes.md)；fixture：[`../hcp-twin/fixtures/zhu-tongyu.p0.json`](../hcp-twin/fixtures/zhu-tongyu.p0.json)
- [x] 文献检索号码字段 → [`../../specs/5.hcp-twin-data-dictionary.md`](../../specs/5.hcp-twin-data-dictionary.md) §3.2
