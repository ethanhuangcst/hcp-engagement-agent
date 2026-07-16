# Web App 功能规格（反推自当前设计）

> as_of：2026-07-16  
> 依据：[`1.product-definition.md`](../1.product-definition.md)、[`6.ui-guideline.md`](../6.ui-guideline.md)、[`3.architecture.md`](../3.architecture.md)、[`5.hcp-twin-data-dictionary.md`](../5.hcp-twin-data-dictionary.md)、Canvas 原型 `hca-ui-prototype`、[`knowledge/hcp-twin/twin-data-structure.md`](../../knowledge/hcp-twin/twin-data-structure.md)  
> 范围：`apps/web` 表达层 + BFF 所暴露的**用户可感知功能**（不含 MCP/Agent/RAG 进程内部实现细节，但标注依赖）。

## 实现批次说明

功能列表「实现批次」列**默认均为 TBD**（待排期）；排期时再填入下表代号。

| 批次 | 目标 | 验收重心 |
|------|------|----------|
| **B0** | 应用壳与设计令牌 | 四 Tab 导航骨架、Specimen Index、主题 token |
| **B1** | 数字分身闭环 | 列表 → 查询 HCP → 候选消歧 → 确认保存 → 详情；Tab 门禁 |
| **B2** | HCP 洞察报表 | 八类信息可读可链；空窗不绘假高峰 |
| **B3** | 一人一策 | 选项卡方案 + 生成/合规闸门 + 页底短对话 |
| **B4** | Engagement Agent | 历史会话、附件、resize、流式对话 |
| **B5** | 横切与硬化 | 导出、错误可修复、鉴权、a11y、轮询/SSE |
| **TBD** | 未排期（默认） | 功能已定义，实现顺序待定 |

---

## 功能列表

| 序号 | 功能编号 | 功能名称 | 功能简述 | 实现批次 |
|------|----------|----------|----------|----------|
| 1 | F-WEB-001 | 应用壳与四 Tab 导航 | 顶栏文字 Tab：数字分身 / HCP洞察 / 一人一策 / HCP Engagement Agent；主列 max-width 1120；落地 `6.ui-guideline` token | TBD |
| 2 | F-WEB-002 | Specimen Index | 左侧（或移动顶栏）标本索引条：当前 HCP 姓氏缩写 + 置信点；未选定 HCP 时显示占位 | TBD |
| 3 | F-WEB-003 | Tab 门禁（未选定 HCP） | 列表 / 新增查询 / 候选 / 编辑态：隐藏「HCP洞察」「一人一策」；始终显示「数字分身」「HCP Engagement Agent」 | TBD |
| 4 | F-WEB-004 | Tab 门禁（已打开分身） | 打开详情或确认保存后：显示「HCP洞察」「一人一策」；上下文绑定当前 `hcpId` | TBD |
| 5 | F-WEB-005 | 数字分身列表 | 表格式列表：序号、姓名、`hcp:id`、医院/科室、一句话洞察、级别标签、as_of；显示「共 N 位」 | TBD |
| 6 | F-WEB-006 | 级别标签展示 | 渲染 `hcp_tier` + `role_tags`（对比底色，最多主标+3 辅标）；数据来自 Twin `profile.tags` | TBD |
| 7 | F-WEB-007 | 打开分身详情 | 「打开」进入详情：姓名、标签、一句话洞察（`doing_now`，由 Agent `synthesizeDoingNow` 生成/刷新）、文献检索号码表、职业轨迹时间轴 | TBD |
| 8 | F-WEB-008 | 删除分身 | 行内删除；确认后移除本地 Twin JSON；若删当前上下文则回退列表并关闭洞察/一人一策 Tab | TBD |
| 9 | F-WEB-009 | 修改分身（基本信息） | 「修改」进入编辑：改姓名/医院/科室；展示已有 ORCID 等只读文献号；「保存修改」后回详情并保持 Tab 可用 | TBD |
| 10 | F-WEB-010 | 新增分身入口 | 「新增数字分身」进入录入页；主按钮文案为「查询 HCP」（非「构建分身」） | TBD |
| 11 | F-WEB-011 | 查询 HCP（MCP 消歧） | 提交姓名+医院+科室 → BFF → `resolve_hcp_identity`（及必要补齐）；展示候选列表（含 ORCID/PubMed/Scholar/OpenAlex 等） | TBD |
| 12 | F-WEB-012 | 选择候选记录 | 用户点选正确候选；进入分身预览详情（未落盘） | TBD |
| 13 | F-WEB-013 | 确认并保存分身 | 「确认并保存」写入 `data/twins/{hcpId}/`；触发或排队 `build_twin` 补齐职业/科研/洞察；进入已保存详情 | TBD |
| 14 | F-WEB-014 | Twin 构建进度 | 长任务返回 `runId`；UI 阶段文字（身份锁定→职业→科研→洞察）；React Query 轮询或 SSE `get_twin_status` | TBD |
| 15 | F-WEB-015 | 文献检索号码展示 | 详情/候选/洞察侧展示 AuthorIds 表（orcid、pubmed_author、google_scholar、openalex、scopus、cnki）；空值「待绑定」 | TBD |
| 16 | F-WEB-016 | 职业轨迹时间轴 | 数字分身详情：垂直脊线 + 教育/现任/曾任/学会节点（mono 年代） | TBD |
| 17 | F-WEB-017 | HCP 洞察页壳 | 选定 HCP 后打开洞察：姓名、标签、as_of、twin_version；可选导出入口 | TBD |
| 18 | F-WEB-018 | 一句话洞察（含分析） | 展示 `doing_now.summary` + 可选 `analysis`；与数字分身同源；文案由 Agent 合成（见 agent-function-spec I-AGT-001） | TBD |
| 19 | F-WEB-019 | 科研方向与成果 | 按 `research.themes` 列出方向；每方向下挂著作/荣誉/认可等成果（可带链接） | TBD |
| 20 | F-WEB-020 | 活动热力四列表 | 表头：更早 \| 90天 \| 60天 \| 30天；单元格活动：日期·地点·名称（链接）；空窗「无公开证据」 | TBD |
| 21 | F-WEB-021 | 已知近期学术活动 | 列出近窗外/已知名活动条目（日期·地点·名称链接） | TBD |
| 22 | F-WEB-022 | 兴趣方向 | 多轴展示 `interest_directions`（标题+分析+分桶/合规旁注）；禁止仅标签堆砌 | TBD |
| 23 | F-WEB-023 | 可能的机会 | 展示 `opportunities.items`（优先级、建议负责人/渠道、不假设清单） | TBD |
| 24 | F-WEB-024 | 证据与来源表 | 来源名可点击 URL；置信、as_of；关联 Twin 证据字段 | TBD |
| 25 | F-WEB-025 | 洞察 KPI 摘要 | ≤3 个指标（如方向数、近窗会务数、级别/消歧状态）；禁大色块卡墙 | TBD |
| 26 | F-WEB-026 | 一人一策选项卡 | 3–5 条方案水平选项卡；内容区字段：动作/负责人/渠道/主题/成功信号/合规旁注/优先级/引用 | TBD |
| 27 | F-WEB-027 | 生成 Engagement 方案 | 「生成方案」→ BFF → Agent；基于当前 Twin 洞察与机会生成 Options 并落盘 | TBD |
| 28 | F-WEB-028 | 送合规闸门检查 | 「送合规闸门检查」→ 调用/提示 cn-hcp-compliance 闸门；展示通过/附条件/拒绝结构化结果 | TBD |
| 29 | F-WEB-029 | 一人一策页底短对话 | 嵌入「与 Agent 讨论本方案」；`mode=revise_options` + 当前 `optionRunId`；完整对话导流 Agent Tab（`open_chat`） | TBD |
| 30 | F-WEB-030 | Agent 对话主界面（chat 模式） | 标准对话：`mode=open_chat` → BFF → Agent；消息流、气泡、Markdown（标题克制）；与一人一策页底 `revise_options` 分 mode | TBD |
| 31 | F-WEB-031 | Agent 历史会话 | 左栏会话列表；新建会话；生产用浏览器 cookie（或等价本地持久化）存历史索引 | TBD |
| 32 | F-WEB-032 | Agent 附件上传 | 输入坞旁上传；展示附件名列表；随轮次传给 Agent（服务端落盘策略按架构） | TBD |
| 33 | F-WEB-033 | Agent 面板 resize | 对话面板右上角拖动手柄调整宽高；设最小尺寸 | TBD |
| 34 | F-WEB-034 | Agent 流式回复 | 可选 SSE 流式输出；每轮落盘 `sessions/{sessionId}.json` | TBD |
| 35 | F-WEB-035 | BFF 网关（浏览器只调 BFF） | 浏览器禁止直连 MCP/Qdrant/LLM Key；统一 `/api/*` | TBD |
| 36 | F-WEB-036 | Twin 读写 API | `GET/POST/PATCH/DELETE` 分身与状态；Zod 校验；原子写本地 JSON | TBD |
| 37 | F-WEB-037 | Insights 读取 API | `GET /api/insights/[hcpId]` 读 insights JSON | TBD |
| 38 | F-WEB-038 | Options / Chat / DoingNow API | `POST /api/engagement/options`、`POST /api/engagement/chat`（含 mode）、`POST /api/insights/doing-now` → Agent | TBD |
| 39 | F-WEB-039 | 按需专科 ingest 触发 | Twin 确认后按 `specialties/themes` 触发 medical-kb on-demand ingest（可异步） | TBD |
| 40 | F-WEB-040 | 错误与空状态文案 | 可修复失败提示（如未消歧补链接、未绑文献号）；空列表引导新增；无 emoji | TBD |
| 41 | F-WEB-041 | 洞察/报表导出 | 线框「导出」（PDF/打印友好：隐藏导航，保留表与时间轴） | TBD |
| 42 | F-WEB-042 | 无障碍与响应式 | 键盘焦点、对比度 AA、`prefers-reduced-motion`；小屏热力表横滑、Agent 历史改抽屉 | TBD |
| 43 | F-WEB-043 | 鉴权与租户上下文（若启用） | 登录后绑定 tenant；产品/SOP 上下文不写入 Twin 本体 | TBD |

---

## 依赖关系（简图）

排期后可参考的建议依赖（当前功能批次均为 TBD，不强制执行顺序）：

```text
B0 壳 ──► B1 数字分身 ──► B2 洞察
                      └──────────► B3 一人一策 ──► B4 Agent
横切：B5 贯穿各批；F-WEB-035 建议尽早强制（浏览器只调 BFF）
```

## 非目标（本表不列实现项）

- MCP Playwright 采集器内部调度
- Qdrant / embedding 管线实现细节
- 正式 MLR 电子签系统（仅闸门结果展示）

## 相关文档

- UI：[`6.ui-guideline.md`](../6.ui-guideline.md)
- 架构：[`3.architecture.md`](../3.architecture.md)
- 数据：[`5.hcp-twin-data-dictionary.md`](../5.hcp-twin-data-dictionary.md)
- 结构分类：[`../../knowledge/hcp-twin/twin-data-structure.md`](../../knowledge/hcp-twin/twin-data-structure.md)
