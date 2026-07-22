# hcp-engagement-agent 用户故事与验收标准（ATDD）

> as_of：2026-07-17  
> 依据：[`agent-function-spec.md`](./agent-function-spec.md)（F-AGT-* / I-AGT-*）  
> 角色默认：**药企 HCP 互动负责人**（经 BFF 消费 Agent）；契约场景中的执行者称「调用方」  
> 验收样例 HCP：复旦大学附属中山医院 **朱同玉** 教授  
> 写法：Given-When-Then；约束类辅以规则清单。场景描述业务可观测结果，不绑定厂商 SDK 或控件 ID。

## 文档约定

| 项 | 说明 |
|----|------|
| 故事编号 | `US-AGT-NNN` |
| 追溯 | 每条故事列出覆盖的 `F-AGT-*` / 主要 `I-AGT-*` |
| 完成定义 | 本文件 AC 全部通过，且符合 [`../7.test-strategy.md`](../7.test-strategy.md) SMART DoD |
| 实现批次 | 填 **MVP-1…MVP-4**，见 [`../1.product-definition.md`](../1.product-definition.md) |

---

## US-AGT-001 Agent 壳、LLM 适配与密钥边界

**As a** 调用方（BFF）  
**I want to** 经统一模型客户端调用默认 Qwen，并可配置切换兼容提供方，且浏览器永不持有密钥  
**So that** 洞察与方案生成可替换模型而不改对外能力名称  

**覆盖**：F-AGT-001、001a–d、005、028 · I-AGT-005  
**MVP**：MVP-2  

### 验收标准

```gherkin
Feature: LlmClient 与安全边界

  Scenario: 默认提供方为 Qwen
    Given 未显式覆盖模型提供方配置
    When 调用方构造 Agent 运行时
    Then 默认使用 Qwen 兼容路径
    And 业务入口不直接散落调用各厂商 SDK

  Scenario: 切换提供方无需改 Capability 名称
    Given 已配置为兼容端点提供方与对应模型、密钥
    When 调用方执行健康检查或一次生成调用
    Then 仍走同一套对外能力名称
    And 元数据可记录提供方与模型名供审计

  Scenario: 浏览器路径不持有 LLM 密钥
    Given 用户仅通过 Web 使用产品
    When 审查浏览器可达资源与网络目标
    Then 不出现模型密钥
    And 浏览器不直连模型提供方

  Scenario: 缺密钥时健康态降级或启动失败可配置
    Given 严格模式下缺少有效密钥
    When 调用方启动或健康检查
    Then 报告模型不可用或配置非法
    And 错误为结构化结果且无堆栈泄露
```

---

## US-AGT-002 一句话洞察合成与同源消费

**As a** 药企 HCP 互动负责人  
**I want to** 在数字分身与 HCP 洞察看到同一份「正在做什么」摘要  
**So that** 访前准备不会面对互相矛盾的两套文案  

**覆盖**：F-AGT-008、009、010 · I-AGT-001  
**MVP**：MVP-2  

### 规则清单

- Agent 拥有展示用 `doing_now.summary`；summary 空/缺失时写入，`refresh=true` 强制覆盖。
- MCP Stage E 不写最终 summary。

### 验收标准

```gherkin
Feature: synthesizeDoingNow

  Scenario: 合成可审计一句话洞察并写回
    Given 朱同玉分身已有可用 Insights 骨架
    When 调用方请求合成或刷新一句话洞察
    Then 生成一至三句摘要，可选附分析段与证据指针
    And 结果写回洞察中的正在做什么字段并带生成时点

  Scenario: 列表、详情与洞察页同源
    Given 一句话洞察已生成
    When 用户分别在数字分身列表或详情与 HCP 洞察查看该摘要
    Then 三处展示同一份摘要内容
    And 不出现两套互相矛盾的文案

  Scenario: 事实过少时降级而非编造
    Given 分身事实不足以支撑可审计摘要
    When 调用方请求合成
    Then 返回可修复的输入不足错误，或降级短句并标明低置信
    And 不编造无证据的疗效或拜访结论
```

---

## US-AGT-003 生成一人一策（双检索、双引用、合规闸门）

**As a** 药企 HCP 互动负责人  
**I want to** 为当前 HCP 生成三到五条 Engagement 方案，且敏感路径必须引用合规并接受闸门结果  
**So that** 访前方案可执行、可审计，且不替代正式 MLR  

**覆盖**：F-AGT-002–004、006、011–018、024–027、029 · I-AGT-002、004、006–009  
**MVP**：MVP-4  

### 规则清单

- 合规闸门与一人一策「送检」按钮共用 `runComplianceGate`。
- 提案路径不可跳过合规检索。

### 验收标准

```gherkin
Feature: proposeOptions 主路径

  Scenario: 生成三到五条带双引用的方案
    Given 朱同玉已选定且 Insights 可用
    And 合规索引可用（学术索引可稀疏）
    When 用户请求生成 Engagement 方案
    Then 返回三到五条方案
    And 每条含动作、负责人、渠道、主题、成功信号、优先级等约定字段
    And 方案带学术引用与合规引用字段（敏感动作合规引用强制）

  Scenario: 提案路径不可跳过合规检索
    Given 提案主路径开始执行
    When 系统编排检索步骤
    Then 必须执行合规检索
    And 若跳过合规检索则路径失败或拒绝敏感生成

  Scenario: 无合规命中时对敏感互动降级
    Given 合规检索返回空且互动类型敏感
    When 生成或闸门评估发生
    Then 拒答或标注需人工合规确认
    And 不假装已引用具体条款

  Scenario: 生成后 Fail-fast 结构化结果
    Given 方案已生成
    When 用户或系统触发合规闸门检查
    Then 返回通过、附条件或拒绝之一
    And 附带可理解的发现列表
    And 明确结果不替代正式 MLR 签批

  Scenario: 权限硬边界生效
    Given 模型试图输出说明书外疗效或处方/统方策略
    When 闸门或权限检查执行
    Then 该内容被拒绝或剥离
    And 院内推广类旁注提示机构同意与代表备案要求

  Scenario: 无 Insights 时失败可修复
    Given 目标分身无可用 Insights
    When 调用方请求生成方案
    Then 返回未找到洞察类错误与修复提示
```

### 规则清单

- 主路径薄编排：读 Insights → 学术‖合规检索 → 闸门 → 生成 → 合规检查 → 落盘。
- 上下文保护：Insights 经 tool 注入；禁止整包 Twin 塞进提示。
- 标签缺省：T1 偏 MSL；行政/政策角色慎促销话术。
- 租户产品/SOP 上下文可参与检索过滤，**不写入** Twin 本体。

---

## US-AGT-004 一人一策修订对话

**As a** 药企 HCP 互动负责人  
**I want to** 在一人一策页以短对话修订当前方案  
**So that** 反馈能写回同一轮方案而不与开放闲聊混淆  

**覆盖**：F-AGT-007、015、020、021 · I-AGT-003、I-AGT-010  
**MVP**：MVP-4  

### 验收标准

```gherkin
Feature: revise_options

  Scenario: 修订模式必须绑定当前方案
    Given 用户已生成一套方案
    When 用户在一人一策页底发送修订反馈
    Then 对话以修订模式运行且绑定该方案运行标识
    And 助手回复可写回更新后的方案与会话消息

  Scenario: 修订不强制重跑全图
    Given 修订会话进行中
    When 模型决定是否再次检索
    Then 允许按需检索而不强制完整重跑提案全图

  Scenario: 会话模式不可混用
    Given 某会话已以修订模式创建
    When 调用方用开放对话模式复用同一会话标识
    Then 返回模式不匹配错误
    And 提示新建会话
```

---

## US-AGT-005 开放对话、流式与附件上下文

**As a** 药企 HCP 互动负责人  
**I want to** 在 Engagement Agent 中进行**通用**多轮对话，可选流式输出与附件摘要  
**So that** 我能做领域找人、渠道与合规讨论，而不被某一分身上下文绑死，且不与一人一策修订会话串线  

**覆盖**：F-AGT-019、022、023 · I-AGT-003  
**MVP**：MVP-4  

### 规则清单

- `open_chat` **不**默认注入 Twin / Insights；`hcpId` 可选（P0 客户端不传）。
- `open_chat` 不直接改写 `doing_now`；刷新洞察走 `synthesizeDoingNow`。
- 分身级方案修订仅 `revise_options`（一人一策页底）。
- 服务端 `open_chat` 会话落库 `hcp_id=_agent_general`（占位 Twin，非真实医生）。

### 验收标准

```gherkin
Feature: open_chat

  Scenario: 开放对话为通用 Agent
    Given 用户未要求绑定某一分身
    When 用户在 Agent 对话中提问（如疾病领域找人）
    Then 回复不依赖「当前打开的数字分身」洞察
    And 默认不在未表达意图时改写一人一策方案

  Scenario: 流式输出可落盘
    Given 流式响应已启用
    When 用户发送一条消息
    Then 用户看到增量输出
    And 该轮对话写入会话历史

  Scenario: 附件仅作上下文摘要
    Given 用户上传附件到对话
    When 模型生成回复
    Then 附件以摘要或元数据进入上下文
    And 系统不默认可执行任意文件内容
```

---

## US-AGT-006 契约测试与朱同玉验收

**As a** 开发 / 产品验收方  
**I want to** 在 mock 模型下跑通契约，并在配置提供方后对朱同玉做 live 抽检  
**So that** CI 不依赖外网密钥，发版前仍有真实路径信心  

**覆盖**：F-AGT-029、030  
**MVP**：MVP-4（live 抽检不挡 PR）  

### 验收标准

```gherkin
Feature: Agent 验收门禁

  Scenario: mock 模型契约覆盖关键路径
    Given 测试注入 mock 模型客户端
    When 运行 Agent 契约测试
    Then 覆盖一句话洞察、五类能力、双引用、合规闸门与对话模式
    And 另覆盖提供方配置解析

  Scenario: 朱同玉 live 抽检（发版前）
    Given 已配置可用模型密钥与必要知识库
    When 对朱同玉执行一句话洞察、生成方案与一次开放对话
    Then 一句话洞察可审计
    And 方案数量与引用字段符合约定
    And 开放对话可完成至少一轮有上下文的回复
```

---

## 故事与功能追溯矩阵

| 用户故事 | F-AGT 覆盖 | 主要接口 | MVP |
|----------|------------|----------|-----|
| US-AGT-001 | 001、001a–d、005、028 | I-AGT-005 | MVP-2 |
| US-AGT-002 | 008–010 | I-AGT-001 | MVP-2 |
| US-AGT-003 | 002–004、006、011–018、024–027、029 | I-AGT-002、004、006–009 | MVP-4 |
| US-AGT-004 | 007、015、020–021 | I-AGT-003、010 | MVP-4 |
| US-AGT-005 | 019、022–023 | I-AGT-003 | MVP-4 |
| US-AGT-006 | 029–030 | — | MVP-4 |

## 建议验收顺序

1. MVP-2：US-AGT-001 → 002  
2. MVP-4：US-AGT-003 → 004 → 005 → 006  

## 相关文档

- 功能规格：[`agent-function-spec.md`](./agent-function-spec.md)  
- 设计：[`agent-design.md`](./agent-design.md)  
- 产品 MVP：[`../1.product-definition.md`](../1.product-definition.md)  
- 测试与 DoD：[`../7.test-strategy.md`](../7.test-strategy.md)  
- RAG 故事：[`../rag/rag-stories.md`](../rag/rag-stories.md)  
- MCP 故事：[`../mcp/mcp-stories.md`](../mcp/mcp-stories.md)  
- Web 故事：[`../app/app-stories.md`](../app/app-stories.md)
