# Web App 功能规格（反推自当前设计）

> as_of：2026-07-16  
> 依据：[`1.product-definition.md`](../1.product-definition.md)、[`6.ui-guideline.md`](../6.ui-guideline.md)、[`3.architecture.md`](../3.architecture.md)、[`5.hcp-twin-data-dictionary.md`](../5.hcp-twin-data-dictionary.md)、Canvas 原型 [`hcp-ui-prototype.canvas.tsx`](./hcp-ui-prototype.canvas.tsx)、[`knowledge/hcp-twin/twin-data-structure.md`](../../knowledge/hcp-twin/twin-data-structure.md)  
> 范围：`apps/web` 表达层 + BFF 所暴露的**用户可感知功能**（不含 MCP/Agent/RAG 进程内部实现细节，但标注依赖）。

## 实现批次说明

功能列表「实现批次」列填 **MVP-1…MVP-4**，定义见 [`1.product-definition.md`](../1.product-definition.md)（每个 MVP 可独立闭环验收）。

| MVP | 本规格重心 | 验收重心 |
|-----|------------|----------|
| **MVP-1** | 壳、门禁、分身身份 CRUD、查询消歧、BFF Twin API、构建进度 UI | 列表→查询→保存→详情/改/删；详情触发构建→进度→enrichment |
| **MVP-2** | 洞察页八块、Insights API、导出 | 洞察可读；同源 doing_now（fixture 可验收） |
| **MVP-3** | F-WEB-039 按需 ingest 触发 | 确认后可排队灌库（与 RAG 同批） |
| **MVP-4** | 一人一策 + Agent Tab + Options/Chat API | 方案+闸门+修订+open_chat |

（MCP / RAG 主责见各自规格；本表仅列 Web 相关行。）

---

## 功能列表

| 序号 | 功能编号 | 功能名称 | 功能简述 | 实现批次 |
|------|----------|----------|----------|----------|
| 1 | F-WEB-001 | 应用壳与四 Tab 导航 | 顶栏文字 Tab：数字分身 / HCP洞察 / 一人一策 / HCP Engagement Agent；主列 max-width 1120；落地 `6.ui-guideline` token | MVP-1 |
| 2 | F-WEB-002 | Specimen Index | 左侧（或移动顶栏）标本索引条：仅在**已打开分身详情**（或洞察/一人一策）时显示当前 HCP 姓氏缩写 + 置信点；**列表 / 新增 / 修改**时为未选定占位「—」，不残留上次打开的姓氏 | MVP-1 |
| 3 | F-WEB-003 | Tab 门禁（未选定 HCP） | **列表 / 新增查询 / 候选 / 修改**：隐藏「HCP洞察」「一人一策」；始终显示「数字分身」「HCP Engagement Agent」。进入列表会清除工作台选定上下文，避免 localStorage 残留解锁 | MVP-1 |
| 4 | F-WEB-004 | Tab 门禁（已打开分身） | **打开详情**或确认保存进入详情后：显示「HCP洞察」「一人一策」；上下文绑定当前 `hcpId`；返回列表后重新按 F-WEB-003 收回 | MVP-1 |
| 5 | F-WEB-005 | 数字分身列表 | 表格式列表：序号、姓名、`hcp:id`、医院/科室、一句话洞察、级别标签、as_of；显示「共 N 位」 | MVP-1 |
| 6 | F-WEB-006 | 级别标签展示 | 渲染 `hcp_tier` + `role_tags`（对比底色，最多主标+3 辅标）；数据来自 Twin `profile.tags` | MVP-1 |
| 7 | F-WEB-007 | 打开分身详情 | 「打开」进入详情：姓名、标签、一句话洞察（`doing_now`，由 Agent `synthesizeDoingNow` 生成/刷新）、文献检索号码表、职业轨迹时间轴 | MVP-1 |
| 8 | F-WEB-008 | 删除分身 | 行内删除；确认后移除本地 Twin JSON；若删当前上下文则回退列表并关闭洞察/一人一策 Tab | MVP-1 |
| 9 | F-WEB-009 | 修改分身（基本信息） | 「修改」进入编辑：改姓名/医院/科室；展示已有 ORCID 等只读文献号；「保存修改」后回详情并保持 Tab 可用 | MVP-1 |
| 10 | F-WEB-010 | 新增分身入口 | 「新增数字分身」进入**空白**录入页（姓名/医院/科室/城市均不预填样例 HCP）；主按钮文案为「查询 HCP」（非「构建分身」）；朱同玉等仅作验收手工填写或 fixture，不作表单默认值 | MVP-1 |
| 11 | F-WEB-011 | 查询 HCP（MCP 消歧） | 提交姓名+医院+科室 → BFF → `resolve_hcp_identity`；展示**以人为主体**的候选（姓名 Display、医院/科室/职称、区分同名说明）；文献号与网页源为次级「命中依据」，禁止把网页名当主标题 | MVP-1 |
| 12 | F-WEB-012 | 选择候选医生 | 主按钮「就是这位」；进入分身预览详情（未落盘）；匹配度中文：匹配较稳 / 需核对 / 证据不足 | MVP-1 |
| 13 | F-WEB-013 | 确认并保存分身 | 「确认并保存」写入香港 Postgres（身份 / 标签 / AuthorIds 等已确认字段）；**不自动**触发 `build_twin`（由详情「构建情报」显式启动）；进入已保存详情 | MVP-1 |
| 14 | F-WEB-014 | Twin 构建进度 | 长任务返回 `runId`；UI 阶段文字（身份锁定→职业→科研→洞察）；轮询或 SSE `get_twin_status`；与 MCP Stage A–E **同批** | MVP-1 |
| 15 | F-WEB-015 | 文献检索号码展示 | 详情/候选/洞察侧展示 AuthorIds 表（orcid、pubmed_author、google_scholar、openalex、scopus、cnki）；空值「待绑定」 | MVP-1 |
| 16 | F-WEB-016 | 职业轨迹时间轴 | 数字分身详情：垂直脊线 + 教育/现任/曾任/学会节点（mono 年代）；无节点时诚实空态（MVP-1 不 stub 进度冒充） | MVP-1 |
| 17 | F-WEB-017 | HCP 洞察页壳 | 选定 HCP 后打开洞察：姓名、标签、as_of、twin_version；可选导出入口 | MVP-2 |
| 18 | F-WEB-018 | 一句话洞察（含分析） | 展示 `doing_now.summary` + 可选 `analysis`；与数字分身同源；文案由 Agent 合成（见 agent-function-spec I-AGT-001） | MVP-2 |
| 19 | F-WEB-019 | 科研方向与成果 | 按 `research.themes` 列出方向；每方向下挂著作/荣誉/认可等成果（可带链接） | MVP-2 |
| 20 | F-WEB-020 | 活动热力四列表 | 表头：更早 \| 90天 \| 60天 \| 30天；单元格活动：日期·地点·名称（链接）；空窗「无公开证据」 | MVP-2 |
| 21 | F-WEB-021 | 已知近期学术活动 | 列出近窗外/已知名活动条目（日期·地点·名称链接） | MVP-2 |
| 22 | F-WEB-022 | 兴趣方向 | 多轴展示 `interest_directions`（标题+分析+分桶/合规旁注）；禁止仅标签堆砌 | MVP-2 |
| 23 | F-WEB-023 | 可能的机会 | 展示 `opportunities.items`（优先级、建议负责人/渠道、不假设清单） | MVP-2 |
| 24 | F-WEB-024 | 证据与来源表 | 来源名可点击 URL；置信、as_of；关联 Twin 证据字段 | MVP-2 |
| 25 | F-WEB-025 | 洞察 KPI 摘要 | ≤3 个指标（如方向数、近窗会务数、级别/消歧状态）；禁大色块卡墙 | MVP-2 |
| 26 | F-WEB-026 | 一人一策选项卡 | 3–5 条方案水平选项卡；内容区字段：动作/负责人/渠道/主题/成功信号/合规旁注/优先级/引用 | MVP-4 |
| 27 | F-WEB-027 | 生成 Engagement 方案 | 「生成方案」→ BFF → Agent；基于当前 Twin 洞察与机会生成 Options 并写入 Postgres | MVP-4 |
| 28 | F-WEB-028 | 送合规闸门检查 | 「送合规闸门检查」→ 调用/提示 cn-hcp-compliance 闸门；展示通过/附条件/拒绝结构化结果 | MVP-4 |
| 29 | F-WEB-029 | 一人一策页底短对话 | 嵌入「与 Agent 讨论本方案」；`mode=revise_options` + 当前 `optionRunId`；完整对话导流 Agent Tab（`open_chat`） | MVP-4 |
| 30 | F-WEB-030 | Agent 对话主界面（chat 模式） | 标准对话：`mode=open_chat` → BFF → Agent；消息流、气泡、Markdown（标题克制）；与一人一策页底 `revise_options` 分 mode | MVP-4 |
| 31 | F-WEB-031 | Agent 历史会话 | 左栏会话列表；新建会话；生产用浏览器 cookie（或等价本地持久化）存历史索引 | MVP-4 |
| 32 | F-WEB-032 | Agent 附件上传 | 输入坞旁上传；展示附件名列表；随轮次传给 Agent（服务端落盘策略按架构） | MVP-4 |
| 33 | F-WEB-033 | Agent 面板 resize | 对话面板右上角拖动手柄调整宽高；设最小尺寸 | MVP-4 |
| 34 | F-WEB-034 | Agent 流式回复 | 可选 SSE 流式输出；每轮持久化到 Postgres `chat_sessions` | MVP-4 |
| 35 | F-WEB-035 | BFF 网关（浏览器只调 BFF） | 浏览器禁止直连 MCP/Qdrant/LLM Key；统一 `/api/*` | MVP-1 |
| 36 | F-WEB-036 | Twin 读写 API | `GET/POST/PATCH/DELETE` 分身与状态；Zod 校验；事务写入 Postgres | MVP-1 |
| 37 | F-WEB-037 | Insights 读取 API | `GET /api/insights/[hcpId]` 读 insights JSON | MVP-2 |
| 38 | F-WEB-038 | Options / Chat / DoingNow API | `POST /api/engagement/options`、`POST /api/engagement/chat`（含 mode）、`POST /api/insights/doing-now` → Agent | MVP-4 |
| 39 | F-WEB-039 | 按需专科 ingest 触发 | Twin 确认后按 `specialties/themes` 触发 medical-kb on-demand ingest（可异步） | MVP-3 |
| 40 | F-WEB-040 | 错误与空状态文案 | 可修复失败提示（如未消歧补链接、未绑文献号）；空列表引导新增；无 emoji | MVP-1 |
| 41 | F-WEB-041 | 洞察/报表导出 | 线框「导出」（PDF/打印友好：隐藏导航，保留表与时间轴） | MVP-2 |
| 42 | F-WEB-042 | 无障碍与响应式 | 键盘焦点、对比度 AA、`prefers-reduced-motion`；小屏热力表横滑、Agent 历史改抽屉 | MVP-4 |
| 43 | F-WEB-043 | 鉴权与租户上下文（若启用） | 登录后绑定 tenant；产品/SOP 上下文不写入 Twin 本体 | MVP-4 |

---

## 依赖关系（简图）

排期后可参考的建议依赖（批次见产品 MVP-1…4）：

```text
MVP-1 Twin 工作台（身份 + 情报构建）──► MVP-2 洞察工作台 ──► MVP-4 Engagement
MVP-3 知识库（可与 MVP-2 并行）────────────────────────────────────────┘
横切：F-WEB-035 浏览器只调 BFF（自 MVP-1 强制）
```

产品 MVP 总表：[`../1.product-definition.md`](../1.product-definition.md)（**4 批**）。

## 非目标（本表不列实现项）

- MCP Playwright 采集器内部调度
- Qdrant / embedding 管线实现细节
- 正式 MLR 电子签系统（仅闸门结果展示）

## 相关文档

- UI：[`6.ui-guideline.md`](../6.ui-guideline.md)
- UI 原型：[`hcp-ui-prototype.canvas.tsx`](./hcp-ui-prototype.canvas.tsx)
- 产品 MVP：[`../1.product-definition.md`](../1.product-definition.md)
- 架构：[`3.architecture.md`](../3.architecture.md)
- 数据：[`5.hcp-twin-data-dictionary.md`](../5.hcp-twin-data-dictionary.md)
- 结构分类：[`../../knowledge/hcp-twin/twin-data-structure.md`](../../knowledge/hcp-twin/twin-data-structure.md)
- 用户故事：[`app-stories.md`](./app-stories.md)
