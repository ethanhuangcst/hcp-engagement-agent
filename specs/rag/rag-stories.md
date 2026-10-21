# medical-knowledge-base（RAG）用户故事与验收标准（ATDD）

> as_of：2026-10-21（新增 US-RAG-007：受控学科目录扩充与学术索引批量种子，MKB2-02 / feature-09；US-RAG-008：合规知识覆盖信号与条款版本治理，MKB2-03；US-RAG-009：学术索引写入与恢复健壮性修复，DEF-003 / DEF-004）  
> 依据：[`rag-function-spec.md`](./rag-function-spec.md)（F-RAG-* / I-RAG-*）  
> 角色默认：**Agent / BFF / 运维调用方**（下文称「调用方」）  
> 验收锚点：合规种子命中含条款号；朱同玉相关专科可按需命中  
> 写法：Given-When-Then；约束类辅以规则清单。场景描述可观测结果，不绑定具体向量 SDK API。

## 文档约定

| 项 | 说明 |
|----|------|
| 故事编号 | `US-RAG-NNN` |
| 追溯 | 每条故事列出覆盖的 `F-RAG-*` / 主要 `I-RAG-*` |
| 完成定义 | 本文件 AC 全部通过，且符合 [`../7.test-strategy.md`](../7.test-strategy.md) SMART DoD |
| 实现批次 | 填 **MVP-1…MVP-4**，见 [`../1.product-definition.md`](../1.product-definition.md) |

---

## US-RAG-001 双索引壳、语料目录与向量库安全绑定

**As a** 运维 / BFF 调用方  
**I want to** 在本地安全边界内部署学术与合规双索引，并确认语料与向量不进 Git、不对公网裸暴露  
**So that** 知识库可运维且满足数据驻留与安全硬约束  

**覆盖**：F-RAG-001、002、002a–d、003、018、023、024、026 · I-RAG-007  
**MVP**：MVP-3  

### 验收标准

```gherkin
Feature: medical-kb 壳与安全边界

  Scenario: 双 collection 分离存在
    Given medical-kb 已初始化
    When 调用方执行健康检查
    Then 报告学术索引与合规索引均已就绪或可创建
    And 二者不得混为单一索引

  Scenario: 主题语料与代码分离
    Given 数据根目录已配置
    When 运维查看语料布局
    Then 学术、合规、租户 SOP 落在独立主题目录下
    And 运行时语料与向量目录被版本库忽略（仅保留占位）

  Scenario: 不安全绑定在严格模式下被拒绝
    Given 向量库地址指向不可接受的公网暴露形态
    And 严格绑定检查已启用
    When 调用方启动或执行健康检查
    Then 返回不安全绑定类错误
    And 默认后端仍为本地 Qdrant，而非托管向量 SaaS

  Scenario: 非法入参返回结构化错误
    Given medical-kb API 已就绪
    When 调用方提交缺少必填字段的检索或灌库请求
    Then 返回校验失败错误且无堆栈、无密钥
```

### 规则清单

- Embedding / Rerank：**默认进程内小模型**（可换更大模型）；公有云 API 仅显式例外。见 [`../ToDo.md`](../ToDo.md)。
- `knowledge_status` 权威在 `rag_ingest_jobs` / manifest；不写 Twin JSON。
- 租户 SOP：同一合规索引 + `tenant_id` 过滤；不分 collection。
- Qdrant 绑定检查始终开启；开发用 localhost 即安全。

---

## US-RAG-002 Hybrid 检索底座与 Citation 契约

**As a** Agent 调用方  
**I want to** 经 dense+sparse 融合与重排获得带引用字段的切块  
**So that** 生成方案时能附上可审计的学术/合规引用  

**覆盖**：F-RAG-004–007、010 ·（检索能力由 US-RAG-003/004 暴露）  
**MVP**：MVP-3  

### 验收标准

```gherkin
Feature: Hybrid 检索管线

  Scenario: 检索结果含统一 citation 字段
    Given 目标索引中已有可检索切块
    When 调用方发起合规或学术检索
    Then 每条切块含文本、来源、版本、时点与分数
    And 标明所属索引为学术或合规

  Scenario: 融合后再重排截断
    Given dense 与 sparse 两路均可召回
    When 执行 Hybrid 检索
    Then 先融合两路召回再重排
    And 最终返回条数受 top 限制（默认不超过五条量级）
```

### 规则清单

- 学术切块可含 PMID/DOI/权威级别等；合规切块须可含 `clause_id`、管辖区、可选租户。
- RRF 权重可配，默认 dense 权重高于 sparse。

---

## US-RAG-003 合规种子灌库与合规检索

**As a** 运维 / Agent 调用方  
**I want to** 从本地合规语料灌种子库，并按条款检索命中  
**So that** 一人一策提案路径能强制引用合规条款  

**覆盖**：F-RAG-009、011、013 · I-RAG-002、I-RAG-005  
**MVP**：MVP-3  

### 验收标准

```gherkin
Feature: 合规索引

  Scenario: 种子灌库写入合规索引与清单
    Given 本地合规语料目录存在 P0 准则文件
    When 调用方执行合规种子灌库
    Then 切块按条款号拆分后写入合规索引
    And 更新 ingest 清单版本与生效信息
    And 同版本重复灌库结果稳定

  Scenario: 抽检问法命中含条款号
    Given 合规种子已灌入
    When 调用方以典型中国市场互动合规问法检索
    Then 至少一条命中切块含条款号与版本或时点
    And 切块来自合规索引而非学术索引

  Scenario: 空结果可返回并由上层闸门处理
    Given 问法在库中无匹配条款
    When 调用方执行合规检索
    Then 允许返回空切块列表
    And 不伪造条款号

  Scenario: 禁止整份 PDF 糊成单块
    Given 合规源文件为多条款文档
    When 执行灌库切块
    Then 输出多块且块级可对应条款号
```

---

## US-RAG-004 专科学术按需灌注与学术检索

**As a** BFF / Agent 调用方  
**I want to** 在 Twin 确认后按专科异步灌注，并检索带 specialty 过滤的学术切块  
**So that** 不做全科预灌也能支撑朱同玉相关主题引用  

**覆盖**：F-RAG-008、012、014–017、019、020、027 · I-RAG-001、I-RAG-003、I-RAG-004  
**MVP**：MVP-3  

### 验收标准

```gherkin
Feature: 学术按需库

  Scenario: 触发按需灌注立即返回任务
    Given 分身已确认且具备可归一化的专科或主题
    When 调用方触发按需学术灌注
    Then 立即返回任务标识与知识状态
    And 拉取内容先落入本地学术语料目录再写入向量索引
    And 不阻塞 Twin 主保存流程

  Scenario: 可查询灌注进度
    Given 某专科灌注任务已创建
    When 调用方按任务或专科查询状态
    Then 返回状态、可选进度与错误信息

  Scenario: 同专科进行中任务互斥
    Given 该专科已有进行中的灌注
    When 调用方再次触发且未强制重跑
    Then 返回灌注进行中类提示且可稍后重试

  Scenario: 专科归一化失败可修复
    Given 输入无法映射到受控专科
    When 调用方触发灌注
    Then 返回专科未解析错误
    And 不把自由文本直接当作灌库查询权威键

  Scenario: 覆盖不足时给出稀疏状态
    Given 某专科近窗公开文献不足
    When 完成覆盖检查或灌注结算
    Then 知识状态可标记为稀疏或待补
    And 该状态可被上层用于降级提示

  Scenario: 学术检索按专科过滤可命中
    Given 朱同玉相关专科语料已灌入本地库
    When 调用方按该专科检索学术内容
    Then 返回带 citation 的切块且 specialty 过滤生效
    And 结果不串入合规索引切块
```

### 规则清单

- 公开源拉取须限流；优先开放获取/摘要；闭源不存全文。
- Coverage：ready / sparse / pending。

---

## US-RAG-005 租户 SOP 隔离与回归集

**As a** 多租户组织的 BFF 调用方  
**I want to** 上传本租户 SOP 并保证跨租户不可见，同时用无客户明文的回归集抽检  
**So that** 客户私有合规材料安全可用  

**覆盖**：F-RAG-021、022、025 · I-RAG-006  
**MVP**：后置（Parent-Document 为增强，可后置）  

### 验收标准

```gherkin
Feature: 租户 SOP 与 eval

  Scenario: 租户 SOP 入库后仅本租户可检索
    Given 租户 A 已上传 SOP 并写入合规索引
    When 调用方以租户 B 身份检索相同问法
    Then 不得返回租户 A 的 SOP 切块
    And 若请求租户与切块租户不一致则拒绝或过滤为空

  Scenario: 回归集不含真实客户 SOP 明文
    Given 本地存在 RAG 回归用例文件
    When 审查用例内容
    Then 不含真实客户 SOP 正文
    And 可用于重复抽检合规/学术命中率
```

---

## US-RAG-006 元数据层 MySQL 方言修复（DEF-002）

**As a** 平台所有者  
**I want to** medical-kb 的 `rag_ingest_jobs` / `ingest_manifest` 读写与 MySQL（ADR-005）方言一致  
**So that** 灌注任务、状态回写与 manifest 更新在 MySQL 上真实可用，支撑 `retrieve_academic` / `retrieve_compliance`  

**覆盖**：F-RAG-017、018（含 013 的 manifest 写路径）· [DEF-002](../issues-log.md) · [MKB2-01](../product-backlog.md#pb-9)  
**MVP**：MVP-3 缺陷修复  

### 验收标准

```gherkin
Feature: medical-kb 元数据层 MySQL 方言

  Scenario: jobs 读写使用 MySQL 方言
    Given getPool 返回 MySQL 连接池
    When 调用方执行 createJob / getJobById / getLatestJobBySpecialty / findInProgressJob / updateJob
    Then SQL 使用 ? 占位符，进行中过滤用 IN (?, ?)
    And INSERT / UPDATE 后按 job_id 回读 SELECT 返回完整行
    And 五个函数的入参与返回形状与修复前一致

  Scenario: manifest upsert 使用 ON DUPLICATE KEY UPDATE
    Given 同一 doc_id 重复灌库
    When 执行 upsertManifest 与 upsertAcademicManifest
    Then SQL 为 INSERT ... AS new ON DUPLICATE KEY UPDATE（行别名形式）
    And 不再出现 $n 占位、::date cast 或 ON CONFLICT 语法

  Scenario: JSON 列往返正确
    Given rag_ingest_jobs.error 为 MySQL JSON 列
    When 写入错误对象并读回
    Then 写入传 JSON 字符串，读出经解析还原为对象
    And 非法 JSON 内容不产生未捕获异常

  Scenario: 回归门禁全绿
    When 运行 npm run typecheck -w @hca/medical-kb 与 npm run test -w @hca/medical-kb
    Then 两者通过，无 Postgres 方言残留
```

### 规则清单

- 表结构不动：`rag_ingest_jobs` / `ingest_manifest` 已由 MySQL 迁移 `002_mvp4_rag.sql` 建好。
- `knowledge_status` 权威仍在 jobs / manifest，不写 Twin JSON。
- `loadRootEnv` 收敛不在本故事（OGT：单一 env 配置与 loader 收敛）。

---

## US-RAG-007 受控学科目录扩充与学术索引批量种子（MKB2-02 / feature-09）

**As a** Agent / MCP 调用方
**I want to** 受控学科目录覆盖临床一级学科全集，且学术索引一次性批量种子到位
**So that** 任何临床学科的 HCP 入库后预灌可命中、`retrieve_academic` 能返回真实学科证据与 coverage

**覆盖**：F-RAG-028、029（消费 F-RAG-014–017、019 既有管线）· [MKB2-02](../product-backlog.md#pb-12) · [ADR-014](../../docs/adr/ADR-014-retrieve-coverage-signal-and-academic-ingest.md)
**MVP**：MVP-3 扩充（Sprint 2 · feature-09）

### 验收标准

```gherkin
Feature: 受控学科目录扩充与批量种子

  Scenario: 新学科可归一化
    Given 受控目录已扩充到临床一级学科全集
    When 调用方以 neurology 或 神经内科 / 神经病学 归一化
    Then 返回受控键 neurology
    And 未收录别名仍返回专科未解析错误

  Scenario: 科室正则补种预灌新学科
    Given 分身科室为 神经病学 或 神经内科
    When 调用 add_hcp 或 Web confirm 触发预灌
    Then resolveSpecialtiesForIngest 解析出 neurology
    And 预灌照常触发

  Scenario: 批量种子后每学科覆盖就绪
    Given 批量种子脚本已跑完
    When 逐学科执行 coverageCheck
    Then 每个受控学科状态为 ready（chunk ≥ 3）
    And 脚本可重跑、重复执行结果稳定

  Scenario: 王拥军神经内科检索命中真实证据
    Given 王拥军（hcp_a5057449191）已入库且批量种子完成
    When 调用方以神经内科查询 retrieve_academic
    Then 返回真实神经内科语料切块（非低分近邻）
    And coverage 为 { specialty: neurology, status: ready }

  Scenario: 单学科拉取失败降级不阻塞
    Given 某学科 PubMed / OpenAlex 拉取失败
    When 批量脚本继续执行
    Then 该学科降级 fixture 种子并记结构化日志
    And 其余学科照常完成

  Scenario: 全部源不可用可重跑
    Given 某学科全部语料源不可用
    When 批量脚本执行到该学科
    Then 记结构化日志并跳过
    And 修复源后重跑仅补该学科
```

### 规则清单

- 学科清单为临床一级学科全集（内、外、妇、儿等约 20-30 个；neurology 为首个案例）。
- 批量种子是一次性冷启动；之后新学科走既有链路（add_hcp 预灌或 MCP2-08 `ingest_academic`）。
- 公开源限流、摘要 / OA 优先、闭源不存全文（F-RAG-020 底线不变）。
- `knowledge_status` 权威仍在 `rag_ingest_jobs` / manifest，不写 Twin JSON。

---

## US-RAG-008 合规知识覆盖信号与条款版本治理（MKB2-03）

**As a** Agent / 运维调用方
**I want to** 合规检索带覆盖信号，条款新版本灌入后旧版本自动下线
**So that** 合规稀疏可见、可补种，检索不会返回过时条款

**覆盖**：F-RAG-030、031、032 · [MKB2-03](../product-backlog.md#pb-13)（未排期）
**MVP**：MVP-3 扩充

### 验收标准

```gherkin
Feature: 合规覆盖信号与条款版本治理

  Scenario: 合规检索返回覆盖信号
    Given rdpac 与 cn_med_rep_measures 全局种子已灌库
    When 调用方执行 retrieve_compliance
    Then chunks 每条含 clause_id / authority / version
    And coverage 列出各 authority 的 chunk 数与最新 as_of，与 ingest_manifest 一致

  Scenario: 覆盖信号获取失败降级省略
    Given ingest_manifest 读取失败
    When 调用方执行 retrieve_compliance
    Then 检索照常返回 chunks，响应无 coverage 字段，不报错

  Scenario: 稀疏时建议补种
    Given 合规库 manifest 无任何 authority 行（未灌种）
    When 调用方执行 retrieve_compliance
    Then coverage.status 为 sparse 并附 repair_hint，建议运维灌种后重试

  Scenario: 新版本灌入后旧版本下线
    Given rdpac 2024-01 已灌库且检索可命中
    When 运维灌入 rdpac 2026-01 新版本
    Then 同 clause_id 的 2024-01 旧条款不再出现在检索结果
    And manifest 指向新版本，重复执行结果稳定

  Scenario: 未注册 authority 无词表门槛
    Given 新建 corpus/compliance/nmpa/2025-12/chunks.jsonl 且每行合法
    When 运维执行 seed_compliance
    Then 照常灌入并写 manifest，无受控词表校验

  Scenario: 种子扩充后抽检命中
    Given rdpac 2024-01 扩到不少于 15 条、cn_med_rep_measures 2026-08 扩到不少于 8 条
    When 调用方按条款关键词抽检检索
    Then 命中条款含 clause_id / authority / version，无编造条款
```

### 规则清单

- `coverage` 权威在 `ingest_manifest`，不写 Twin JSON。
- 检索不内联补种：稀疏只给信号与 `repair_hint`，同 ADR-014 学术侧语义。
- 合规知识保持手动策展，不按病种自动爬（F-RAG-013 口径不变）。
- 租户 SOP（F-RAG-021）不在本故事，仍后置。
- 不新增对外 MCP 工具；`retrieve_compliance` 返回体扩展除外。

---

## US-RAG-009 学术索引写入与恢复健壮性修复（DEF-003 / DEF-004）

**As a** 运维 / 调用方
**I want to** 学术 point ID 按学科唯一、健康探测能发现坏 shard、批量写入窗口可优雅退出、损坏可按 runbook 快速恢复
**So that** 28 学科索引无静默覆盖，Qdrant 损坏可检测、可恢复，批量灌库不产生半状态

**覆盖**：F-RAG-033、034（消费 023、029） · [DEF-003 / DEF-004](../issues-log.md) · [rag-design §20](./rag-design.md)
**MVP**：MVP-3 缺陷修复

### 验收标准

```gherkin
Feature: 学术索引写入与恢复健壮性

  Scenario: 同 PMID 跨学科不互相覆盖
    Given 两个学科的语料含同一 PMID
    When 依序灌入 academic_index
    Then 两个 point 的 ID 因含 specialty 而不同，payload 各自保留
    And 双方 coverage 计数均不减

  Scenario: 重灌后盘库一致
    Given 28 个学科语料在 data/rag/corpus/academic/ 盘上
    When 清 academic_index 后全量重灌
    Then 28 学科盘-vs-库逐条相等（非仅 coverageCheck ≥ 3 阈值）
    And 重跑批量脚本全部 skipped_ready（幂等）

  Scenario: 王拥军锚点复验
    Given 全量重灌完成
    When 以神经内科调用 retrieve_academic（:3300 tools/call）
    Then 返回 neurology 5 条真实证据且 coverage ready

  Scenario: 健康探测发现坏 shard
    Given academic_index 某 shard 磁盘损坏（listCollections 仍正常）
    When 调用 health()
    Then 带 filter 的 1 点探测读触发 panic / 500
    And health 返回 ok: false 并附错误细节

  Scenario: 批量写入窗口优雅退出
    Given 批量种子正在灌某学科
    When 进程收到 SIGTERM / SIGINT
    Then CLI 等待当前学科 job 到终态再退出
    And 无半状态写入窗口，已完学科保持 skipped_ready

  Scenario: 损坏恢复 runbook
    Given Qdrant 读路径 panic 不可恢复
    When 按 runbook 停 Qdrant、删 academic_index、重启、重灌
    Then 在 5 分钟内恢复 28/28 ready，compliance 同批灌入
```

### 规则清单

- 迁移必须清 `academic_index` 全量重灌：新旧 point ID 不同，原地重跑留孤儿点污染 BM25。
- 同 PMID 跨学科是 PubMed 按专科查询的常态，各自成点不是去重错误。
- scroll 三处改 point-ID 游标为稳健化项（F-RAG-034），不是 DEF-004 根因修复。
- 健康探测、信号陷阱、runbook 三者合为 DEF-004 修复口径，一次做完。

---

## 故事与功能追溯矩阵

| 用户故事 | F-RAG 覆盖 | 主要接口 | MVP |
|----------|------------|----------|-----|
| US-RAG-001 | 001–003、002a–d、018、023–024、026 | I-RAG-007 | MVP-3 |
| US-RAG-002 | 004–007、010 | （底座） | MVP-3 |
| US-RAG-003 | 009、011、013 | I-RAG-002、005 | MVP-3 |
| US-RAG-004 | 008、012、014–017、019–020、027 | I-RAG-001、003、004 | MVP-3 |
| US-RAG-005 | 021–022、025 | I-RAG-006 | 后置 |
| US-RAG-006 | 013、017、018 | （元数据层修复，DEF-002） | MVP-3 缺陷修复 |
| US-RAG-007 | 028、029（消费 014–017、019） | （目录数据 + 批量脚本，MKB2-02） | MVP-3 扩充 |
| US-RAG-008 | 030、031、032（消费 013、018） | I-RAG-002、005 | MVP-3 扩充（未排期） |
| US-RAG-009 | 033、034（消费 023、029） | （缺陷修复，DEF-003 / DEF-004） | MVP-3 缺陷修复 |

## 建议验收顺序

0. 缺陷修复：US-RAG-006（MVP-3 验收路径前置）；US-RAG-009（DEF-003 / DEF-004 修复，Sprint 2 feature-09 验收前置）  
1. MVP-3：US-RAG-001 → 002 → 003 → 004  
2. MVP-3 扩充：US-RAG-007（Sprint 2 · feature-09；依赖 US-RAG-004 管线已绿）  
3. MVP-3 扩充（未排期）：US-RAG-008（MKB2-03，合规侧；排入 sprint 后执行）  
4. 后置：US-RAG-005  

## 相关文档

- 功能规格：[`rag-function-spec.md`](./rag-function-spec.md)  
- 设计：[`rag-design.md`](./rag-design.md)  
- 产品 MVP：[`../1.product-definition.md`](../1.product-definition.md)  
- 测试与 DoD：[`../7.test-strategy.md`](../7.test-strategy.md)  
- Agent 故事：[`../agent/agent-stories.md`](../agent/agent-stories.md)  
- Web 故事：[`../app/app-stories.md`](../app/app-stories.md)
