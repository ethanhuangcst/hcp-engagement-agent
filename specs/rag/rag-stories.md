# medical-knowledge-base（RAG）用户故事与验收标准（ATDD）

> as_of：2026-07-17  
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

## 故事与功能追溯矩阵

| 用户故事 | F-RAG 覆盖 | 主要接口 | MVP |
|----------|------------|----------|-----|
| US-RAG-001 | 001–003、002a–d、018、023–024、026 | I-RAG-007 | MVP-3 |
| US-RAG-002 | 004–007、010 | （底座） | MVP-3 |
| US-RAG-003 | 009、011、013 | I-RAG-002、005 | MVP-3 |
| US-RAG-004 | 008、012、014–017、019–020、027 | I-RAG-001、003、004 | MVP-3 |
| US-RAG-005 | 021–022、025 | I-RAG-006 | 后置 |

## 建议验收顺序

1. MVP-3：US-RAG-001 → 002 → 003 → 004  
2. 后置：US-RAG-005  

## 相关文档

- 功能规格：[`rag-function-spec.md`](./rag-function-spec.md)  
- 设计：[`rag-design.md`](./rag-design.md)  
- 产品 MVP：[`../1.product-definition.md`](../1.product-definition.md)  
- 测试与 DoD：[`../7.test-strategy.md`](../7.test-strategy.md)  
- Agent 故事：[`../agent/agent-stories.md`](../agent/agent-stories.md)  
- Web 故事：[`../app/app-stories.md`](../app/app-stories.md)
