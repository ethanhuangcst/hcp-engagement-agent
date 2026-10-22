# 产品概览 — HCP Engagement Assistant

> 类型：Framework (process) artifact，产品：HCP Engagement Assistant
> as_of: 2026-10-22

---

<a id="index"></a>

## 目录

- [产品概览](#product-overview)
- [Definition of Done](#definition-of-done)
- [需求](#requirements)
  - [对外服务](#external-service)
  - [后台维护](#background-maintenance)
  - [Agent](#agent)
- [Product Backlog](#product-backlog)
- [变更记录](#change-record)

---

<a id="product-overview"></a>

# 产品概览

- 2.0 让调用方不打开网页，也能完成网页上的医生数字分身列表、查询与新增、洞察，以及带引用的学术与合规证据检索；一人一策生成与合规预审不经对外 MCP（[ADR-012](../docs/adr/ADR-012-mcp2-data-plane-only.md)）。
- 对外 MCP 工具名统一为 `list_hcp`、`query_hcp`、`add_hcp`、`get_hcp_insights`、`retrieve_academic`、`retrieve_compliance`（数据面，[ADR-012](../docs/adr/ADR-012-mcp2-data-plane-only.md)）。
- Agent 优化（[AGT2-01](#pb-8)）：用 **ROCKS 范式**优化 Agent 质量，覆盖一人一策、开放对话与一句话洞察在真实 LLM 下的输出、时延与降级；经现有 Agent 包与 BFF 交付，不新增对外 MCP 工具。
- 数字分身内容的刷新由后台定时任务完成，不放在对外 MCP 里。
- 采集用的内部接口仍只给本系统使用，不作为对外入口。

[返回目录](#index)

---

<a id="definition-of-done"></a>

# Definition of Done

本节是在 `sdd-dod.mdc` 标准完成定义之上的额外产品检查。只有标准项与本节每一项都通过，才能把 PBI 标为 **Done**。

- 对外响应里不出现数据库口令或模型密钥。
- 对外入口不提供采集用的内部能力，例如消歧后的情报构建和热力刷新。

[返回目录](#index)

---

<a id="requirements"></a>

# 需求

<a id="external-service"></a>

## MCP

下列每条对应一个对外 MCP 工具（工具名见标题）。字段名与 Web BFF、`@hca/domain` 一致。出错时返回 `{ code, message, repair_hint? }`；不返回密钥、堆栈或内网路径。列表与查询结果均不含 `_agent_general` 占位医生。

- <a id="pb-1"></a>[MCP2-01](#pb-1) `query_hcp` · 查询 HCP
  - **做什么**：在已保存医生中按条件查找；命中几位就返回几位。可选一并检索库外候选（公开源检索消歧，ADR-010）。
  - **Annotations**：只读（`readOnlyHint: true`）；`openWorldHint: true`。
  - **参数**（可组合；至少传 `hcp_id` 或 `name` 之一）：
    - `hcp_id`：系统编号；存在则只查这一位（仍放在 `items` 数组里）。
    - `name`：姓名，中文或拼音均可。
    - `hospital`、`department`、`city`：均可选，用于缩小范围。医院与科室支持归一相等或包含匹配（短式如「协和医院」可命中「北京协和医院」；见 [ADR-011](../../docs/adr/ADR-011-hospital-department-substring-match.md)），城市仍归一精确。
    - `include_external`：布尔，默认 false；为 true 时检索库外候选（与库内命中同人者不重复出现）。
  - **返回**：`{ count, items[] }` 为库内命中，每条为完整数字分身及可选 `build.runId`。`include_external` 为 true 时响应另含 `external: { count, items[] }`，每条库外候选带 `candidate_id`、姓名、医院/科室/职称、文献号与命中依据；`candidate_id` 约 30 分钟有效、仅用于 `add_hcp`。外部源失败时降级为仅库内并提示，不算工具失败。
  - **失败**：`VALIDATION_ERROR`；指定 `hcp_id` 不存在时为 `NOT_FOUND`。
- <a id="pb-7"></a>[MCP2-06](#pb-7) `list_hcp` · 列出 HCP
  - **做什么**：列出全部已保存医生（与 Web「HCP 列表」同一范围）。
  - **Annotations**：只读（`readOnlyHint: true`）。
  - **参数**：无必填；2.0 **不提供** `limit`、`offset` 分页，一次返回全量。
  - **返回**：`{ count, items[] }`；含 `hcp_id`、姓名、医院、科室、`as_of`、标签、一句话洞察摘要等。
  - **失败**：`INTERNAL_ERROR`。
- <a id="pb-2"></a>[MCP2-02](#pb-2) `add_hcp` · 新增 HCP
  - **做什么**：仅新增 `query_hcp` 检索到并经人选认的库外 HCP：凭 `candidate_id` 确认身份后写入库（同 Web「确认并保存」）；不阻塞等待构建。写库成功后异步起一次 build，返回 `refresh: { run_id }` 供调用方经 `get_twin_status` 查进度（ADR-013）。写前仍按 ADR-009 姓名规则查重，命中疑似同人先返回待确认清单。
  - **Annotations**：写库；非删除；非幂等。
  - **参数**：`candidate_id`（必填，来自 `query_hcp` 库外候选）；可选 `confirm_not_duplicate`（布尔；确认疑似同人确非重复后置 `true` 强制写入）。身份字段不再由调用方填写，由候选内容生成。
  - **返回**：写入成功为 `{ twin, hcp_id, refresh: { run_id } }`；疑似同人时为 `{ status: "confirmation_required", possible_duplicates[] }`（未写库，每条含 hcp_id、姓名、医院、科室、命中档位）。写入成功后候选令牌即作废。
  - **失败**：`VALIDATION_ERROR`、`NOT_FOUND`（候选令牌不存在或已过期，需重新 `query_hcp` 后再选）、`INTERNAL_ERROR`。
- <a id="pb-3"></a>[MCP2-03](#pb-3) `get_hcp_insights` · HCP 洞察
  - **做什么**：读取洞察页数据（一句话洞察及科研、热力、机会等块）。`doing_now` 为空模板且 Twin 事实足够时，服务器内经 `ensureDoingNow` 合成一次并写回缓存（ADR-013）；同一 HCP 有进行中 run 时复用，LLM 失败降级返回空模板 + `pending`，不报 INTERNAL_ERROR。
  - **Annotations**：读 + 幂等缓存回填（`readOnlyHint: false`，ADR-013）。
  - **参数**：`hcp_id`（必填）。
  - **返回**：`{ twin, insights }`；`doing_now.summary` 为一句话洞察；按需合成发生的调用附 `synthesized: true`。
  - **失败**：`NOT_FOUND`。
- <a id="pb-4"></a>[MCP2-04](#pb-4) `retrieve_academic` · 学术证据检索
  - **做什么**：按 HCP 与条件检索 medical-kb 学术证据，返回带引用的 chunk；**不生成方案、不写库**。
  - **Annotations**：只读（`readOnlyHint: true`）；命中公开文献库（`openWorldHint: true`）。
  - **参数**：对齐 [agent/agent-function-spec.md](./agent/agent-function-spec.md) I-AGT-007（`hcp_id` 必填；`query`、`specialty`、`themes` 可选）。
  - **返回**：`{ chunks[] }`，每条含正文与 citation。
  - **失败**：`NOT_FOUND`、`INTERNAL_ERROR`。
- <a id="pb-5"></a>[MCP2-05](#pb-5) `retrieve_compliance` · 合规条款检索
  - **做什么**：检索合规知识库条款，返回条款引用（`clause_id` / `authority` / `version`）；工具 description 写明**不是预审判定、不替代**正式 MLR（[ADR-012](../docs/adr/ADR-012-mcp2-data-plane-only.md)）。
  - **Annotations**：只读（`readOnlyHint: true`）。
  - **参数**：对齐 I-AGT-008（`hcp_id` 必填；`query`、`interaction_type` 可选）。`tenant_id` **不作入参**：来自服务端鉴权上下文；租户鉴权未上线前仅返回全局种子。
  - **返回**：`{ chunks[], coverage?, repair_hint? }`，每条 chunk 含条款引用与 citation；`coverage` 以 `ingest_manifest` 为权威列出各 authority（version / chunk_count / 最新 as_of），`sparse` 附 `repair_hint` 建议 `seed_compliance` 灌种，manifest 读取失败时降级省略该键（[MKB2-03](#pb-13) 增补，[mcp2-design §11](mcp2.0/mcp2-design.md)）；检索层契约已在 medical-kb 落地，feature-04 做对外 MCP 接线。
  - **失败**：`NOT_FOUND`、`INTERNAL_ERROR`。
- <a id="pb-10"></a>[MCP2-07](#pb-10) 知识覆盖对齐 · `add_hcp` 预灌 + `retrieve_academic` coverage 信号
  - **做什么**：MCP 调用方与 Web 获得同等的知识库覆盖（[ADR-014](../docs/adr/ADR-014-retrieve-coverage-signal-and-academic-ingest.md)）。两件事：`add_hcp` 写库成功后 fire-and-forget 按 Twin 专科触发知识预灌（与 Web confirm 的 `triggerKnowledgeIngest` 同语义，失败只记日志不阻塞返回）；`retrieve_academic` 返回体增加 `coverage`（复用 `coverageCheck` 的 `status` 与专科 chunk 数），`sparse` 时附 `repair_hint` 建议补种。
  - **Annotations**：不变（`retrieve_academic` 保持 `readOnlyHint: true`，coverage 信号为只读旁路）。
  - **返回**：`retrieve_academic` 改为 `{ chunks[], coverage }`；`add_hcp` 返回体可选附 `knowledge_jobs[]`（对齐 Web confirm）。
  - **失败**：新增断言不含阻塞类错误——预灌失败不影响 `add_hcp` 成功返回；coverage 获取失败降级为省略字段，检索不报错。
- <a id="pb-11"></a>[MCP2-08](#pb-11) `ingest_academic` · 学术知识按需灌注
  - **做什么**：按 `specialty` 显式触发 medical-kb `ingest_on_demand`（coverage 门控：ready 幂等跳过；否则异步 job 拉 PubMed/OpenAlex → corpus → embed → upsert），立即返回 job 引用；配套 `get_ingest_status` 按 `job_id` 或 `specialty` 查进度（[ADR-014](../docs/adr/ADR-014-retrieve-coverage-signal-and-academic-ingest.md)）。
  - **Annotations**：写工具（`readOnlyHint: false`，知识面幂等写，同 ADR-013 修订先例）；`openWorldHint: true`（公开源拉取）。
  - **参数**：`specialty`（必填，受控专科键）；`themes`（可选）。`hcp_id` **不作入参**：灌注以专科为粒度，与调用方身份无关。
  - **返回**：`ingest_academic` 为 `{ job_id, knowledge_status }`（`INGEST_IN_PROGRESS` 时返回进行中 job）；`get_ingest_status` 为 job 状态与进度。
  - **失败**：`VALIDATION_ERROR`（受控专科键无法归一化）、`INGEST_IN_PROGRESS`、`INTERNAL_ERROR`。
- <a id="pb-14"></a>[MCP2-09](#pb-14) add_hcp 入库科室校验与预灌映射预览
  - **做什么**：三件事。`resolve_hcp_identity` 候选的科室字段带来源标注（「来自调用方输入提示，未经数据源核实」，DEF-005），数据源（OpenAlex 主题/机构元数据）有可用信号时一并返回并与输入对照，不一致附 mismatch 提示。`add_hcp` 确认返回与 Web 确认页显示「科室 → 将预灌专科」映射结果（复用 `resolveSpecialtiesForIngest`），让确认者当场发现科室错标。department 映射不到任何受控专科时在返回中提示（预灌静默跳过的行为不变，但可见）。
  - **动因**：DEF-005 两次实际发生（陆林「神经科」错标 → 预灌错灌 neurology；王拥军「神经病」截断）；预灌按 department 正则静默执行，确认时无法发现错标。
  - **范围外**：不自动纠正科室（OpenAlex 无可靠中文科室字段）；不新增对外工具。**后续修订（2026-10-21）**：入库科室规则与 mismatch 闸门已由 [MCP2-10](#pb-16)（DEF-006，D2 方向）取代本条范围外口径；本条交付的来源标注、信号对照与映射预览继续有效。
  - **验收口径**：候选与确认返回体含科室来源标注；mismatch 场景有提示；映射预览与实际预灌专科一致；测试覆盖输入错标场景。
  - **失败**：数据源信号不可用时降级为仅来源标注，不阻塞确认流程。
  - **规格**：[mcp2-design §13](mcp2.0/mcp2-design.md) · [US-MCP2-007](mcp2.0/mcp2-stories.md) · [mcp2 测试计划 §14](mcp2.0/mcp2-test.md) · [F-MCP-012 增补与 US-MCP-002 场景扩充](mcp/mcp-function-spec.md) · [mcp-design MCP2-09 节与 mcp-tests §5](mcp/mcp-design.md) · [F-WEB-047 与 US-WEB-004 场景扩充](app/app-function-spec.md) · [app-design §6](app/app-design.md)。

- <a id="pb-15"></a>[MKB2-04](#pb-15) 学术索引写入与恢复健壮性修复（DEF-003 / DEF-004）
  - **做什么**：`academicPointId` 键改含 specialty（`${specialty}:pmid:${pmid}` / `${specialty}:doi:${doi}`，F-RAG-033），迁移清 `academic_index` 全量重灌；`health()` 加双 collection 带 filter 1 点探测读（F-RAG-023 改写）；seed CLI 加 SIGTERM / SIGINT 信号陷阱，等待当前学科 job 终态再退出（F-RAG-029 补）；三处 scroll 改 point-ID 游标（F-RAG-034，稳健化项）；恢复 runbook 落地（rag-design §20.2）。
  - **动因**：DEF-003 实测 13/28 学科丢点（跨专科同 PMID 互相覆盖 point payload）；DEF-004 写入窗口进程被强杀 → Qdrant WAL 损坏 → 读路径 panic 不可恢复，`health()` 探不出坏 shard。
  - **范围外**：不动 MCP 工具面；不改 Web。
  - **验收口径**：28 学科盘-vs-库逐条相等；重跑幂等全 `skipped_ready`；health 探测发现坏 shard；恢复演练 ≤5 分钟恢复 28/28；测试见 rag-tests §7（US-RAG-009）。

- <a id="pb-16"></a>[MCP2-10](#pb-16) add_hcp 入库科室以选中记录信号专科为准（DEF-006，D2）
  - **做什么**：三件事。① 入库科室改规则：`add_hcp` 与 Web 确认保存的 `twin.identity.department` 取选中候选的 `department_signal.specialty`（信号专科）映射的受控专科标准中文名（如 psychiatry → 精神科），不再取调用方输入原文；查询表单科室仅作检索提示，确认页无科室编辑入口。② 强闸门：候选带 `department_mismatch`（输入侧与信号侧不一致）时须人工确认——MCP 侧新增可选参数 `confirm_department_checked: true`、Web 侧勾选「已人工核对科室」才放行，未确认返回 `department_confirmation_required` 不写库；记录无信号专科（`department_signal.specialty` 缺失）时阻断保存，返回 `DEPARTMENT_SIGNAL_MISSING`，`repair_hint` 提示换检索条件重查或人工核实。③ 预灌与入库一致：`specialty_preview` 的 department 行以入库科室（信号专科中文名）为输入，预灌专科与入库科室恒一致。
  - **动因**：DEF-006（DEF-005 修复后 live 复验暴露）：侯凡凡输入「神内科」`matched: false` 仍原样入库；产品方向已定（2026-10-21，D2）。
  - **数据现实约束**：OpenAlex 记录无科室字段，信号来自概念归一，可能缺失（侯凡凡无信号）或噪声（王拥军信号 radiology 而实际神经内科）；闸门必须人工兜底，放行即确认记录侧科室为准。
  - **范围外**：不提供人工改写科室入口（MCP 无科室入参、Web 确认页无编辑框）；不新增对外工具；对内 resolve 契约不变（仍原样回显输入科室）。
  - **验收口径**：入库科室等于选中记录信号专科的标准中文名；mismatch 与无信号两场景有强闸门且集成测试覆盖；确认页科室不可编辑；预灌专科与入库科室一致。
  - **失败**：无信号专科时阻断保存（`DEPARTMENT_SIGNAL_MISSING`）；mismatch 未确认时返回 `department_confirmation_required` 不写库；均不降级为原样入库。
  - **规格**：[mcp2-design §13 增补](mcp2.0/mcp2-design.md) · [US-MCP2-007 增补](mcp2.0/mcp2-stories.md) · [mcp2 测试计划 §14 增补](mcp2.0/mcp2-test.md) · [F-WEB-047 增补](app/app-function-spec.md) · [US-WEB-004 场景扩充](app/app-stories.md) · [app-design §6 修订](app/app-design.md)。


<a id="background-maintenance"></a>

## 后台维护

- <a id="pb-6"></a>[TWIN2-01](#pb-6) 定时自动更新数字分身
  - 系统按计划对已保存医生重新采集并写回数字分身与洞察；每个 HCP build 完成后经 `ensureDoingNow` 合成并写回一句话洞察（ADR-013）。
  - `add_hcp` 异步触发的 build 与本故事共用同一管线与洞察合成入口。
  - 对外 MCP 不提供手动更新或触发构建的入口。
- <a id="pb-9"></a>[MKB2-01](#pb-9) 元数据层 MySQL 方言修复
  - medical-kb 的 `rag_ingest_jobs` / `ingest_manifest` 读写改为 MySQL 方言（`?` 占位、`ON DUPLICATE KEY UPDATE` 行别名、写后回读），表结构不变（[ADR-005](../../docs/adr/ADR-005-mysql-primary-store.md)、[DEF-002](issues-log.md)）。
  - 修复 `retrieve_academic` / `retrieve_compliance`（MCP2-04 / 05）依赖的灌注与 manifest 数据面；`knowledge_status` 权威仍在 jobs / manifest，不写 Twin JSON。
  - 方案 A（原地改方言）已确认；`loadRootEnv` 收敛不在本 PBI（另列 OGT）。


- <a id="pb-12"></a>[MKB2-02](#pb-12) 受控学科目录扩充与学术索引批量种子
  - **做什么**：把受控专科目录从 3 个专科扩充到临床一级学科全集（`specialty.ts` `ALIAS_MAP` 加学科键与中英文别名；`resolveSpecialtiesForIngest` 科室正则同步补），并一次性批量补种学术索引种子语料：每学科经 `ingest_on_demand` 拉 PubMed / OpenAlex 真实文献为主，拉取不可用时 fixture 种子兜底。
  - **范围**：学科清单为临床一级学科全集（内、外、妇、儿等约 20-30 个，含 neurology / 神经内科首个案例）；一次批量补种为冷启动手段，之后新学科走既有链路（add_hcp 预灌或 MCP2-08 `ingest_academic`）自动补。
  - **验收口径**：批量脚本跑完后每学科 `coverageCheck` 为 ready（chunk ≥ 3）；王拥军（`hcp_a5057449191`，神经内科）`retrieve_academic` 返回真实神经内科证据且 `coverage: ready`。
  - **失败**：单学科拉取失败降级 fixture，不阻塞其他学科；全部源不可用时记结构化日志可重跑。
- <a id="pb-13"></a>[MKB2-03](#pb-13) 合规知识覆盖信号与条款版本治理
  - **做什么**：三件事。`retrieve_compliance` 返回体增加 `coverage`（以 `ingest_manifest` 为权威：各 `authority` 清单、chunk 数、最新 `as_of`；缺源时附 `repair_hint`；获取失败降级省略字段，不阻塞检索，同 ADR-014 学术侧语义）。`seed_compliance` 支持条款版本治理：同一 `authority` 灌入新版本时，旧版本条款下线（删除），检索只返回现行版本。P0 合规种子策展扩充：`rdpac` 2024-01 从 6 条扩到不少于 15 条，`cn_med_rep_measures` 2026-08 从 4 条扩到不少于 8 条。
  - **动因**：现有种子仅 10 条、两个来源，检索稀疏不可见；同 `clause_id` 新版本灌入后旧版本 `point` 留存，可能返回过时条款（点 ID 含 `version`，删除不是自动的）。
  - **范围外**：租户 SOP 通路（F-RAG-021 仍后置）；不按病种自动爬；不新增对外 MCP 工具。
  - **验收口径**：新灌版本后，旧版本条款不再出现在检索结果；抽检命中含 `clause_id` / `authority` / `version`；`coverage` 与 `ingest_manifest` 一致；未注册 `authority` 无受控词表门槛，置入 corpus 后可直接灌入。
  - **失败**：coverage 获取失败降级省略字段，检索不报错；版本清理失败记结构化日志，可重跑。
- <a id="pb-17"></a>[MKB2-05](#pb-17) seed CLI 启动序统一（DEF-007）
  - **做什么**：`seed-compliance.ts` main 改为 `ensureDualCollectionsWithProbe()` → `health()` → seed 顺序（同包 `seed-academic-batch.ts` / `ingest-academic.ts` 已正确，不动）；`health()` 与 `ensureDualCollectionsWithProbe()` 本身不改，DEF-004 探测口径不变。
  - **动因**：DEF-007（OGT-5 生产回灌实发）：`health()` 探测读要求双 collection 已存在，seed-compliance 先预检后建集合，空库上永远 404 中止，清库重灌与首次部署需人工预建集合绕过。
  - **范围外**：不做公共启动序抽取（Opportunities 记录在案，本次只修错序的一个）；不动 MCP 工具面；不改 Web。
  - **验收口径**：空库直接 `npm run seed:compliance` 全流程通过、无人工预建；已灌环境重跑幂等；单元回归锁定 ensure → health → seed 调用顺序。
  - **规格**：[US-RAG-010](rag/rag-stories.md) · [rag-design §21](rag/rag-design.md) · [rag 测试计划 §8](rag/rag-tests.md) · [DEF-007](issues-log.md)。
- <a id="pb-18"></a>[REL2-01](#pb-18) MVP2 上线（mvp4 → 生产）
  - **做什么**：把 mvp4 分支（Sprint 2 成果：对外 MCP 八工具、TWIN2 定时刷新、受控专科目录、MySQL 方言修复、生产 RAG 回灌）安全发布到野草云3 Portainer Stack `hcp-engagement-agent`：清障（部署三件套从 main 合入 mvp4、新增 `hcp-engagement-mcp` 镜像 / compose 服务 / CI matrix）、Portainer 更新 Stack（4 服务）、冒烟 S1–S9 与 G4、共存抽查与回滚锚点记录。类型 **Task**：执行件为上线手册，不新增产品功能与对外接口。
  - **前置**：Sprint 2 功能面已齐（对外 MCP 八工具全 Done，生产 RAG 数据已回灌）；feature-03（Agent ROCKS）是否先收口再上线由用户排期决定，上线内容基线以发布当日 mvp4 HEAD 为准。
  - **验收口径**：[go-live-instruction.md](go-live/1021/go-live-instruction.md) 全部 Phase 通过；生产 `hcp-engagement-mcp` 八工具可用（含 `retrieve_compliance` 与 `ingest_academic` / `get_ingest_status`）；生产 Qdrant 与 `ingest_manifest` 三面一致（academic 146 / compliance 23）；共存应用抽查 ≥1 个正常；回滚锚点已记录。
  - **失败**：任一冒烟 S 失败按手册回滚（仅本 Stack `IMAGE_TAG` 回退与新增 Qdrant collection 清理；不动共享网络与他 Stack）。
  - **规格**：[go-live-instruction.md](go-live/1021/go-live-instruction.md) · [env-changes.md](go-live/1021/env-changes.md) · [data-backfill-design.md](go-live/1021/data-backfill-design.md) · [release.md](release.md)。


<a id="agent"></a>

## Agent

- <a id="pb-8"></a>[AGT2-01](#pb-8) Agent 优化
  - 用 **ROCKS 范式**优化 Agent 质量：一人一策、开放对话与一句话洞察在真实 LLM 下达到可验收基线。
  - 优化范围含输出质量、时延与降级策略。
  - 优化结果通过现有 Agent 包与 BFF 交付，不新增对外 MCP 工具。
  - **规格**：[Agent 功能规格 Sprint 2 增补](agent/agent-function-spec.md) · [Agent 设计 §13](agent/agent-design.md) · [US-AGT-007 / 008](agent/agent-stories.md) · [Agent 测试与 eval 计划](agent/agent-tests.md)。

[返回目录](#index)

---

<a id="product-backlog"></a>

# Product Backlog

| # | Component | PBI Code | Description | Size | Related | Sprint | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 对外服务 | [MCP2-01](#pb-1) | query_hcp · 查询 HCP | Implementable | - [Web 分身查询与详情](app/app-function-spec.md)<br>- [对内 get_twin](mcp/mcp-function-spec.md) | Sprint 1 | Done |
| 2 | 对外服务 | [MCP2-06](#pb-7) | list_hcp · 列出 HCP | Implementable | - [Web 分身列表](app/app-function-spec.md)<br>- [对内 listTwins](mcp/mcp-function-spec.md) | Sprint 1 | Done |
| 3 | 对外服务 | [MCP2-02](#pb-2) | add_hcp · 新增 HCP | Implementable | - [Web 确认保存](app/app-function-spec.md)<br>- [对内 confirm_and_save_twin](mcp/mcp-function-spec.md) | Sprint 1 | Done |
| 4 | 对外服务 | [MCP2-03](#pb-3) | get_hcp_insights · HCP 洞察 | Implementable | - [Agent 洞察与 doing_now](agent/agent-function-spec.md)<br>- [Web 洞察页](app/app-function-spec.md) | Sprint 2 | Done |
| 5 | 对外服务 | [MCP2-04](#pb-4) | retrieve_academic · 学术证据检索 | Implementable | - [Agent 学术检索 I-AGT-007](agent/agent-function-spec.md)<br>- [Web 洞察页](app/app-function-spec.md) | Sprint 2 | Done |
| 6 | 对外服务 | [MCP2-05](#pb-5) | retrieve_compliance · 合规条款检索 | Implementable | - [Agent 合规检索 I-AGT-008](agent/agent-function-spec.md)<br>- [Web 合规检查](app/app-function-spec.md) | Sprint 2 | Done |
| 7 | 后台维护 | [TWIN2-01](#pb-6) | 定时自动更新数字分身 | Implementable | - [对内 build_twin](mcp/mcp-function-spec.md)<br>- [安装与运行 §11](spec1.0/4.install-dependencies.md) | Sprint 2 | Done |
| 8 | Agent | [AGT2-01](#pb-8) | Agent 优化 · ROCKS 范式 | Implementable | - [Agent 功能规格（Sprint 2 增补）](agent/agent-function-spec.md)<br>- [Agent 设计 §13](agent/agent-design.md)<br>- [US-AGT-007 / 008](agent/agent-stories.md)<br>- [Agent 测试与 eval 计划](agent/agent-tests.md) | Sprint 2 | Done |
| 9 | 后台维护 | [MKB2-01](#pb-9) | 元数据层 MySQL 方言修复（DEF-002） | Implementable | - [US-RAG-006](rag/rag-stories.md)<br>- [rag 测试计划](rag/rag-tests.md)<br>- [DEF-002](issues-log.md) | Sprint 2 | Done |
| 10 | 对外服务 | [MCP2-07](#pb-10) | 知识覆盖对齐 · add_hcp 预灌 + coverage 信号 | Implementable | - [Web 确认保存 F-WEB-039](app/app-function-spec.md)<br>- [ADR-014](../docs/adr/ADR-014-retrieve-coverage-signal-and-academic-ingest.md) | Sprint 2 | Done |
| 11 | 对外服务 | [MCP2-08](#pb-11) | ingest_academic · 学术知识按需灌注 | Implementable | - [rag 功能规格 ingest_on_demand](rag/rag-function-spec.md)<br>- [ADR-014](../docs/adr/ADR-014-retrieve-coverage-signal-and-academic-ingest.md) | Sprint 2 | Done |
| 12 | 后台维护 | [MKB2-02](#pb-12) | 受控学科目录扩充与学术索引批量种子 | Implementable | - [ADR-014](../docs/adr/ADR-014-retrieve-coverage-signal-and-academic-ingest.md)<br>- [rag 功能规格 ingest_on_demand](rag/rag-function-spec.md) | Sprint 2 | Done |
| 13 | 后台维护 | [MKB2-03](#pb-13) | 合规知识覆盖信号与条款版本治理 | Implementable | - [F-RAG-030–032](rag/rag-function-spec.md)<br>- [US-RAG-008](rag/rag-stories.md) | Sprint 2 | Done |
| 14 | 对外服务 | [MCP2-09](#pb-14) | add_hcp 入库科室校验与预灌映射预览 | Implementable | - [DEF-005](issues-log.md)<br>- [US-MCP2-007](mcp2.0/mcp2-stories.md)<br>- [mcp2-design §13](mcp2.0/mcp2-design.md)<br>- [F-MCP-012 增补](mcp/mcp-function-spec.md)<br>- [F-WEB-047](app/app-function-spec.md) | Sprint 2 | Done |
| 15 | 后台维护 | [MKB2-04](#pb-15) | 学术索引写入与恢复健壮性修复（DEF-003 / DEF-004） | Implementable | - [US-RAG-009](rag/rag-stories.md)<br>- [F-RAG-023/029/033/034](rag/rag-function-spec.md)<br>- [rag-design §20](rag/rag-design.md)<br>- [rag 测试计划 §7](rag/rag-tests.md) | Sprint 2 | Done |
| 16 | 对外服务 | [MCP2-10](#pb-16) | add_hcp 入库科室以选中记录信号专科为准（DEF-006，D2） | Implementable | - [DEF-006](issues-log.md)<br>- [US-MCP2-007 增补](mcp2.0/mcp2-stories.md)<br>- [mcp2-design §13.6](mcp2.0/mcp2-design.md)<br>- [mcp2 测试计划 §15](mcp2.0/mcp2-test.md)<br>- [F-WEB-047 增补](app/app-function-spec.md) | Sprint 2 | Done |
| 17 | 后台维护 | [MKB2-05](#pb-17) | seed CLI 启动序统一（DEF-007） | Implementable | - [DEF-007](issues-log.md)<br>- [US-RAG-010](rag/rag-stories.md)<br>- [rag-design §21](rag/rag-design.md)<br>- [rag 测试计划 §8](rag/rag-tests.md) | Sprint 2 | Done |
| 18 | 后台维护 | [REL2-01](#pb-18) | MVP2 上线（mvp4 → 生产） | Implementable | - [go-live-instruction.md](go-live/1021/go-live-instruction.md)<br>- [env-changes.md](go-live/1021/env-changes.md)<br>- [release.md](release.md) | Sprint 2 | Done |

[返回目录](#index)

---

<a id="change-record"></a>

# 变更记录

| Date | Change |
| --- | --- |
| 2026-10-22 | Sprint 2 关闭：feature-01–14 + task-02 十五条全 Done，MVP2 上生产（`sha-d9989ae`）；[REL2-01](#pb-18) Done（上线执行记录与 DEF-008/009/010 详见 `changes-log.md` / `issues-log.md`）；Sprint-end 回顾入 `sprint-backlog.md`。 |
| 2026-10-22 | [AGT2-01](#pb-8) / feature-03 Done：`prompts/v1` 模板注册表 + 四路径模板版本元数据 + 时延预算降级 + eval 门禁（15/15 过零红线，报告归档）；agent 46/46 绿；用户 close confirm；见 `changes-log.md`。 |
| 2026-10-22 | 用户确认新增 [REL2-01](#pb-18)（MVP2 上线，Task）排入 Sprint 2（SBI task-02，ToDo）；上线准备规格修订：go-live 1021 手册、env-changes、release.md 对齐八工具面与 OGT-5 回灌后基线（B1/B4 已清、B2/B3 待执行）；不动代码。 |
| 2026-10-21 | feature-03 开工准备（用户指令，不动代码）：agent 模块规格四件就位——[功能规格 Sprint 2 增补](agent/agent-function-spec.md)（F-AGT-031~034）、[US-AGT-007 / 008](agent/agent-stories.md)、[agent-design §13](agent/agent-design.md)、新建 [agent-tests.md](agent/agent-tests.md) 入 artifacts-map；[architecture §12](architecture.md) eval-set 用例数置已决（三类各 5 例合计 15，朱同玉 fixture 锚点）；AGT2-01 保持 ToDo。 |
| 2026-10-21 | [MCP2-05](#pb-5) / feature-04 Done：`retrieve_compliance` 对外工具接线验收（实现随前序会话提交）：八工具全齐，租户不入参仅返回全局种子，coverage / sparse `repair_hint` 透传（MKB2-03 增补）；契约 12 例 + live 通过；见 `changes-log.md`。 |
| 2026-10-21 | [MCP2-08](#pb-11) / feature-08 Done：对外 MCP 注册 `ingest_academic` / `get_ingest_status`（写工具 + 只读进度查询），`retrieve_academic` sparse `repair_hint` 点名补种；契约 11 例 + live 冒烟通过；附带兑现 Future action #5（release `.tmp-*.mts` 约定）；见 `changes-log.md`。 |
| 2026-10-21 | [MKB2-05](#pb-17) / feature-14 Done（DEF-007 关闭）：seed-compliance main 改 `ensureDualCollectionsWithProbe` → `health` → seed 启动序（rag-design §21）；空库自举实机验证通过（seeded 23、无人工预建）；回归测试 2 例锁定启动序；见 `issues-log.md`、`changes-log.md`。 |
| 2026-10-21 | DEF-007 开工准备（用户指令）：新增 [MKB2-05](#pb-17)（seed CLI 启动序统一）并写规格三件（rag-design §21、US-RAG-010、rag-tests §8），排入 Sprint 2 backlog（SBI feature-14，ToDo）；issues-log DEF-007 Related 补引用；不动代码。 |
| 2026-10-21 | OGT-5 生产 RAG 向量回灌完成并关闭：生产 Qdrant academic 146 / compliance 23 三面一致；DEF-007（seed-compliance 空库自锁）登记 issues-log；知识条目 [ssh-tunnel-qdrant-backfill-pitfalls.md](./knowledge/ops/ssh-tunnel-qdrant-backfill-pitfalls.md)；见 `changes-log.md`。 |
| 2026-10-21 | Sprint 2 批量收口（用户确认 1-10 全关）：MCP2-04 / MCP2-07 / MKB2-02 / MCP2-09 / MKB2-04 / MCP2-10 六条 Done（SBI feature-02 / 07 / 09 / 10 / 11 / 12）；DEF-003 / 004 / 005 / 006 关闭；OGT-1 关闭；回顾块写入 sprint-backlog，知识条目 [openalex-department-signal-works-concepts.md](./knowledge/data/openalex-department-signal-works-concepts.md)。 |
| 2026-10-21 | MCP2-03 `get_hcp_insights` Done（Sprint 2 feature-01）：对外 MCP 接线 `ensureDoingNow`；契约 42/42、朱同玉实调、close confirm。 |
| 2026-10-20 | DEF-002 方案 A 确认：新增 MKB2-01（medical-kb 元数据层 MySQL 方言修复，Sprint 2）；US-RAG-006 入 rag 故事；rag 模块新增测试计划 rag-tests.md 并入 artifacts-map；rag 规格九处 Postgres 口径改 MySQL（ADR-005）。 |
| 2026-10-20 | Sprint 3 并入 Sprint 2：MCP2-05、TWIN2-01 的 Sprint 列改为 Sprint 2；见 `sprint-backlog.md`、`changes-log.md`。 |
| 2026-10-20 | ADR-012：对外 MCP 只暴露数据面；MCP2-04 / MCP2-05 改为 `retrieve_academic` / `retrieve_compliance`，`propose_engagement_options` / `precheck_compliance` 退出对外工具集；见 [ADR-012](../docs/adr/ADR-012-mcp2-data-plane-only.md)。 |
| 2026-10-20 | `query_hcp` 可选过滤扩展：医院/科室支持包含匹配（ADR-011），城市仍归一精确。 |
| 2026-10-20 | OGT-1：`query_hcp` 增加 `include_external` 双源检索与库外候选 `candidate_id`；`add_hcp` 入参改为凭 `candidate_id` 新增；见 [ADR-010](../../docs/adr/ADR-010-external-resolve-and-candidate-token.md)。 |
| 2026-10-20 | `add_hcp` 补充写前模糊查重：与 `query_hcp` 同款姓名规则，疑似同人返回 `confirmation_required` 待确认，`confirm_not_duplicate` 确认后写入；见 [ADR-009](../../docs/adr/ADR-009-add-hcp-duplicate-check.md)。 |
| 2026-10-19 | Sprint 1–3 排期写入 Product Backlog `Sprint` 列；详见 `sprint-backlog.md`、`changes-log.md`。 |
| 2026-10-19 | 对外 MCP 工具说明并入「对外服务」功能 list，删除独立工具表与目录锚点。 |
| 2026-10-19 | 改写 MCP 工具表为自然语言：`list_hcp` 不分页；`query_hcp` 姓名中英文/拼音、条件可选、多条命中全返回；补充 `tenant_id` / `product_context` 说明。 |
| 2026-10-19 | 对外服务增加 MCP 工具表：六工具入参、返回与 annotations（对齐 BFF / domain）。 |
| 2026-10-19 | 产品概览补充 AGT2-01：用 ROCKS 范式优化 Agent 质量；需求与 Backlog 描述对齐。 |
| 2026-10-19 | 统一对外 MCP 工具名：`query_hcp`、`list_hcp`、`add_hcp`、`get_hcp_insights`、`propose_engagement_options`、`precheck_compliance`（替换 get_hcp_twin / list_hcp_twins / create_hcp_twin / compliance_precheck）。 |
| 2026-10-19 | 新增 MCP2-06 list_hcp_twins、AGT2-01 Agent 优化；对外 MCP 能力与工具名对齐（get_hcp_twin 等）。 |
| 2026-10-19 | 用户确认后写入 Product Backlog 表格：6 条 PBI，Size 均为 Implementable，Sprint 均为 —。 |
| 2026-10-19 | 按确认调整需求：去掉调用方准入；更新改为后台定时任务 TWIN2-01，不列入对外服务；其余五条对外能力保留。 |
| 2026-10-21 | [ADR-014](../docs/adr/ADR-014-retrieve-coverage-signal-and-academic-ingest.md)：`retrieve_academic` 返回体增 coverage 信号、低命中建议补种；新增 [MCP2-07](#pb-10)（add_hcp 预灌对齐 + coverage 信号）与 [MCP2-08](#pb-11)（`ingest_academic` / `get_ingest_status` 工具）；`retrieve_academic` 保持纯读不内联补种。 |
| 2026-10-21 | 用户确认：MCP2-07 / MCP2-08 全部排入 Sprint 2（SBI 分别为 feature-07 / feature-08）；见 `sprint-backlog.md`。 |
| 2026-10-21 | 用户确认新增 [MKB2-02](#pb-12)（受控学科目录扩充到临床一级学科全集 + 学术索引批量种子，PubMed / OpenAlex 为主、fixture 兜底，Sprint 2 SBI feature-09）；动因：王拥军（神经内科）入库后预灌因学科非受控静默跳过，检索无神经内科证据。 |
| 2026-10-20 | [ADR-013](../docs/adr/ADR-013-insight-synthesis-triggers.md)：`get_hcp_insights` 改读 + 按需幂等合成回填；`add_hcp` 写库成功后异步触发 build 并返回 `refresh: { run_id }`；TWIN2-01 build 完成经 `ensureDoingNow` 回填洞察。 |
| 2026-10-19 | 写入 2.0 需求列表首版。 |
| 2026-10-21 | 用户确认新增 [MKB2-03](#pb-13)（合规知识覆盖信号与条款版本治理，未排期 Sprint）：动因是合规种子仅 10 条且检索稀疏不可见、同 `clause_id` 多版本并存无下线机制（ADR-014 学术侧已修，合规侧为独立缺口）；配套 F-RAG-030–032 与 US-RAG-008 已写入 rag 规格。 |
| 2026-10-21 | [DEF-005](issues-log.md) 记录（resolve_hcp_identity 未核实科室回显；陆林/王拥军 twin 科室已修）；用户确认新增 [MCP2-09](#pb-14)（add_hcp 入库科室校验与预灌映射预览，未排期）。 |
| 2026-10-21 | DEF-005 开工准备：MCP2-09 规格三模块写入（mcp2-design §13、US-MCP2-007、mcp2-test §14；mcp 模块 F-MCP-012 增补、US-MCP-002 三场景、mcp-design 新节、mcp-tests §5；app 模块 F-WEB-047、US-WEB-004 两场景、app-design §6），issues-log DEF-005 Related 补引用；用户确认排入 Sprint 2（SBI feature-11）；不动代码。 |
| 2026-10-21 | DEF-006 记录（add_hcp 入库科室仍取调用方输入，未采用选中记录信号专科；侯凡凡「神内科」matched:false 仍原样入库，记录已删）；用户定方向 D2（入库科室以选中记录信号专科为准 + mismatch 强闸门 + 无信号阻断 + 确认页科室不可编辑）并确认新增 [MCP2-10](#pb-16) 排入 Sprint 2，规格先行；不动代码。 |
| 2026-10-21 | DEF-003 / DEF-004 根因实锤与规格更新（issues-log 改写、rag-design §20、F-RAG-023/029 改写 + F-RAG-033/034 新增、US-RAG-009、rag-tests §7）；用户确认另立缺陷修复 PBI [MKB2-04](#pb-15) 并排入 Sprint 2（feature-09 close 前置）。 |

[返回目录](#index)
