# hcp-twin-mcp 用户故事与验收标准（ATDD）

> as_of：2026-10-21（2026-07-17 首版；2026-10-21 US-MCP-002 增补三场景：候选科室来源标注与数据源对照，MCP2-09 / DEF-005）  
> 依据：[`mcp-function-spec.md`](./mcp-function-spec.md)（F-MCP-* / I-MCP-*）  
> 角色默认：**BFF / MCP Client 调用方**（下文称「调用方」）；业务结果以药企 HCP 互动场景可观测为准  
> 验收样例 HCP：复旦大学附属中山医院 **朱同玉** 教授  
> 写法：Given-When-Then；约束类辅以规则清单。场景用语面向可观测契约，不绑定 SDK 方法名或控件 ID。

## 文档约定

| 项 | 说明 |
|----|------|
| 故事编号 | `US-MCP-NNN` |
| 追溯 | 每条故事列出覆盖的 `F-MCP-*` / 主要 `I-MCP-*` |
| 完成定义 | 本文件 AC 全部通过，且符合 [`../7.test-strategy.md`](../7.test-strategy.md) SMART DoD |
| 实现批次 | 填 **MVP-1…MVP-4**，见 [`../1.product-definition.md`](../1.product-definition.md) |

---

## US-MCP-001 MCP 壳、传输、健康检查与 mock 模式

**As a** BFF / MCP Client 调用方  
**I want to** 以 stdio 或 Streamable HTTP 连接 Twin MCP，并查询健康与运行模式  
**So that** 本地与内网集成路径稳定，CI 可零外网冒烟  

**覆盖**：F-MCP-001、002、003、004、005、006、010、030、031、032、035 · I-MCP-007  
**MVP**：MVP-1  

### 验收标准

```gherkin
Feature: MCP 壳与健康检查

  Scenario: 业务与传输解耦后可切换入口
    Given Twin MCP 服务已按配置启动
    When 调用方分别以本地 stdio 与 Streamable HTTP 单端点连接
    Then 同一组 Tool 均可被发现并调用
    And 不依赖遗留 HTTP+SSE 传输即可完成联调

  Scenario: 健康检查回报进程与依赖摘要
    Given Twin MCP 进程已启动
    When 调用方执行健康检查
    Then 返回进程可用状态、数据库可达摘要、当前 twin 模式与版本信息
    And Playwright/Chromium 状态为就绪、跳过或不可用之一，且不含密钥与堆栈

  Scenario: mock 模式零外网可读 fixture
    Given 运行模式配置为 mock
    When 调用方对朱同玉样例执行消歧查询
    Then 返回基于 fixture 的候选结果
    And 过程不发起外网文献或页面抓取

  Scenario: 非法入参返回结构化错误
    Given Twin MCP 已注册全部对外 Tool
    When 调用方提交缺少必填字段的请求
    Then 返回可解析的校验失败错误（含可读说明与是否可重试）
    And 响应中不包含原始堆栈或密钥
```

### 规则清单

- Tool 描述须写明副作用、幂等性、限速/成本与适用时机。
- Chromium 仅允许在 MCP 进程内使用；Web 应用不得依赖 Playwright 采集。
- 环境至少支持：传输方式、端口、数据库连接、twin 模式、爬虫无头开关、可选 NCBI/Redis。

---

## US-MCP-002 身份消歧与文献号门禁

**As a** BFF 调用方  
**I want to** 用姓名、医院、科室消歧 HCP，并得到候选链接与文献号草稿  
**So that** 用户确认人选前不必写入完整分身，且后续灌文献有可修复门槛  

**覆盖**：F-MCP-008、009、011、012、013、014 · I-MCP-001；F-MCP-012 的科室来源标注增补（MCP2-09 / DEF-005）见下方后三场景  
**MVP**：MVP-1  

### 验收标准

```gherkin
Feature: 身份消歧与 AuthorIds

  Scenario: 朱同玉查询返回候选且不强制落完整 Twin
    Given 运行模式为 mock 或 live 均可达
    When 调用方提交姓名「朱同玉」、医院「复旦大学附属中山医院」与对应科室
    Then 返回消歧状态与至少一条 URL 候选
    And 可附带文献号草稿与级别标签草稿
    And 出参标明本次未将完整 Twin 持久化为已确认分身

  Scenario: 查无结果时给出可理解的未解析状态
    Given 查询条件无法匹配公开可信人选
    When 调用方执行消歧
    Then 消歧状态为未解析或等价空候选
    And 不写入完整 Twin

  Scenario: resolved 须满足活跃文献号门槛
    Given 某分身将被标记为已消歧完成
    When 系统校验文献灌库门禁
    Then 须至少具备 ORCID、PubMed 作者号、OpenAlex 之一的非空活跃号
    And 禁止仅凭中文姓名进入论文灌库

  Scenario: 未消歧完成时拒绝灌文献
    Given 分身消歧状态不是已完成
    When 调用方或构建流水线尝试灌论文
    Then 返回未消歧类可修复错误
    And 不写入 recent 论文事实集

  Scenario: 候选科室带来源标注（DEF-005）
    Given 调用方输入科室「神经科」且数据源无可用科室信号
    When 调用方执行消歧
    Then 每条候选的科室字段回显调用方输入并附来源标注
    And 标注为结构化字段（department_provenance：origin 为 caller_input、verified 为 false）
    And 标注不改变候选的 confidence 与消歧状态

  Scenario: 数据源信号与输入归一化一致时无提示
    Given OpenAlex 命中作者的医学主题归一化为受控专科 psychiatry
    And 调用方输入科室归一化到同一受控专科
    When 调用方执行消歧
    Then 候选附数据源信号（department_signal：主题词与归一化专科键）
    And 不产生 mismatch 提示

  Scenario: 数据源信号与输入归一化不一致时提示 mismatch
    Given 调用方输入「神经科」归一化为 neurology
    And OpenAlex 作者医学主题归一化为 psychiatry
    When 调用方执行消歧
    Then 候选附 mismatch 提示，含两侧专科键
    And 候选科室字段不被自动改写（纠错由确认者判断）
    And mismatch 不阻塞消歧与后续确认
```

### 规则清单

- 事实字段尽量带来源 URL、来源类型、时点与置信；冲突写明冲突说明。
- 仅采集公开信息；禁止处方/统方/非公开 CRM/私人手机微信营销画像。
- 活跃文献源优先级：ORCID → PubMed 作者簇 → OpenAlex →（互补）Europe PMC / Crossref。

---

## US-MCP-003 级别打标与用户覆盖

**As a** BFF 调用方  
**I want to** 按规则写入级别主标与角色辅标，并允许用户覆盖且不被规则静默改回  
**So that** 列表筛选与一人一策缺省渠道有稳定、合规的标签  

**覆盖**：F-MCP-015、016、017 · I-MCP-006  
**MVP**：MVP-1  

### 验收标准

```gherkin
Feature: HCP 级别打标

  Scenario: 消歧成功可带回标签草稿
    Given 消歧返回可信候选
    When 调用方查看消歧出参
    Then 可包含级别主标与角色辅标草稿
    And 草稿不暗示处方潜力或统方相关分级

  Scenario: 已入库分身可独立重算标签
    Given 朱同玉分身已确认入库
    When 调用方请求按规则重算标签
    Then 分身画像标签被更新为主标 + 辅标及打标元数据
    And 相同入参重复调用结果稳定

  Scenario: 用户覆盖优先生效
    Given 分身标签已由用户覆盖写入
    When 调用方再次请求规则重算且未声明强制规则覆盖
    Then 用户覆盖标签保持不变

  Scenario: 强制规则可盖过用户覆盖
    Given 分身标签为用户覆盖
    When 调用方声明强制按规则重算
    Then 标签改写为规则结果并记录相应打标方式

  Scenario: 未入库时打标失败可修复
    Given 目标分身尚未确认入库
    When 调用方请求打标
    Then 返回未找到类错误与修复提示
```

---

## US-MCP-004 确认后读取 Twin 与 Insights

**As a** BFF 调用方  
**I want to** 在用户确认保存后读取 Twin 与 Insights  
**So that** 详情页与下游 Agent 能拿到结构化画像  

**覆盖**：F-MCP-007、025 · I-MCP-004、I-MCP-005  
**MVP**：MVP-1  

### 验收标准

```gherkin
Feature: Twin / Insights 读取

  Scenario: 确认保存后可读取 Twin
    Given 调用方已完成朱同玉确认保存并写入主库
    When 调用方按分身标识读取 Twin
    Then 返回符合数据字典形状的 Twin
    And 含级别标签与文献作者号等关键段

  Scenario: 确认保存后可读取 Insights
    Given 该分身已有 Insights 落库
    When 调用方读取 Insights
    Then 返回含正在做什么、兴趣方向、可能机会等字段的结构化结果

  Scenario: 未知分身返回未找到
    Given 分身标识不存在
    When 调用方读取 Twin 或 Insights
    Then 返回未找到类结构化错误
    And 不抛出未捕获异常到调用方
```

### 规则清单

- Twin / Insights 以香港 Postgres 为权威主库（JSONB upsert）。
- 破坏性 schema 变更须升 `schema_version`。

---

## US-MCP-005 异步构建分身与进度查询

**As a** BFF 调用方  
**I want to** 触发全量/增量构建并轮询阶段进度  
**So that** 用户能看到身份→职业→科研→热力→洞察的推进，且同人构建不并发冲突  

**覆盖**：F-MCP-018–024、027–029 · I-MCP-002、I-MCP-003  
**MVP**：MVP-1  

### 验收标准

```gherkin
Feature: build_twin 编排

  Scenario: 触发构建立即返回运行标识
    Given 朱同玉分身已确认且消歧完成
    When 调用方请求全量构建
    Then 立即返回运行标识
    And 后台按身份锚点、职业、科研、热力、洞察阶段推进

  Scenario: 进度可查询并对齐阶段文案
    Given 某次构建运行标识已知
    When 调用方查询构建状态
    Then 返回阶段、0 到 1 进度、可选错误与更新时间
    And 阶段语义对齐：身份 → 职业 → 科研 → 热力（可跳过）→ 洞察

  Scenario: 同人禁止并行 active 构建
    Given 该分身已有进行中的构建
    When 调用方再次触发构建
    Then 返回构建进行中类错误且标明可稍后重试

  Scenario: 科研阶段须过文献号门禁
    Given 分身缺少活跃 P0 文献号
    When 构建进入科研灌库阶段
    Then 跳过或拒绝论文灌库并返回可修复错误
    And 不产生仅凭姓名灌入的论文事实

  Scenario: 热力失败或空窗不阻断洞察衍生
    Given 热力采集失败或各窗无公开证据
    When 构建流水线继续
    Then 热力标记无公开证据或可重试错误
    And 仍可基于身份、职业与科研产出 Insights 结构化草稿

  Scenario: 职业刷新后可重打标并尊重用户覆盖
    Given 职业轨迹增量刷新成功
    When 系统触发标签重算
    Then 默认不静默覆盖用户覆盖标签
```

---

## US-MCP-006 只读 Resources、热力节奏与 live 验收

**As a** Cursor / 调试用 MCP Client  
**I want to** 只读查看 career / research / heatmap 切片，并在 live 下对照样例验收  
**So that** 排障不必绕过 BFF 产品路径，且生产采集质量可核对  

**覆盖**：F-MCP-026、028、033、034 · I-MCP-008–010  
**MVP**：MVP-1  

### 验收标准

```gherkin
Feature: Resources 与 live 验收

  Scenario: 只读资源按 URI 返回 JSON
    Given 分身已构建出职业/科研/热力切片
    When 调用方读取对应 twin 资源 URI
    Then 返回 JSON 且媒体类型为 application/json

  Scenario: 缺失切片返回可读错误
    Given 某切片尚未生成
    When 调用方读取该资源
    Then 返回可读错误而非进程崩溃

  Scenario: 热力非一次性爬取
    Given 热力监控节奏已启用
    When 到达日更或会前扫描点
    Then 系统更新最近轮询时点
    And 结果可增量写入活动热力

  Scenario: 朱同玉 live 产出形状合格
    Given 运行模式为 live 且外网源可用
    When 完成消歧与构建主路径
    Then Twin 形状符合数据字典与样例对照要点
    And 已消歧完成时活跃 P0 文献号满足门槛
```

---

## US-MCP-007 定时刷新数字分身与洞察回填（TWIN2-01 / ADR-013）

**As a** 平台所有者  
**I want to** 系统按计划自动刷新已保存医生的数字分身并回填一句话洞察  
**So that** 不经人工触发，MCP 调用方与 Web 看到的都是较新的分身与洞察  

**覆盖**：F-MCP-036、037 · Sprint 2 `feature-05` · [TWIN2-01](../product-backlog.md#pb-6) · [ADR-013](../../docs/adr/ADR-013-insight-synthesis-triggers.md)  
**MVP**：MVP-2.0  

### 验收标准

```gherkin
Feature: 定时刷新与洞察回填

  Scenario: 未配置 cron 时刷新关闭
    Given 进程未设置 TWIN_REFRESH_CRON
    When 进程启动并度过任意时长
    Then 不发起任何定时刷新
    And 进程行为与 1.0 完全一致

  Scenario: 到期 HCP 按计划刷新
    Given TWIN_REFRESH_CRON 已配置为周期触发
    And 已保存医生中存在距上次成功刷新超过 TTL 的 HCP
    When 调度器执行本轮
    Then 逐个对该 HCP 走 build 管线并写回分身
    And 刷新范围不含 _agent_general

  Scenario: TTL 内的 HCP 跳过
    Given 某 HCP 距上次成功刷新不足 TWIN_REFRESH_TTL_HOURS
    When 本轮刷新执行
    Then 该 HCP 不重新构建

  Scenario: 单个 HCP 失败不阻断本轮
    Given 本轮含多个到期 HCP
    When 其中一个构建失败
    Then 其余 HCP 仍继续刷新
    And 失败记入结构化日志且 Twin 正文保留上次成功版本

  Scenario: 构建成功后回填一句话洞察
    Given 某 HCP 的 build 成功完成
    When 构建完成钩子触发
    Then ensureDoingNow 被调用一次并写回 doing_now
    And 同一 HCP 已有进行中的合成 run 时复用该 run、不重复起任务

  Scenario: add_hcp 写库成功后异步触发刷新
    Given 对外 add_hcp 刚写入一位新 HCP
    When 写入成功返回
    Then 返回体含 refresh.run_id 供 get_twin_status 查询进度
    And 服务端异步对该 hcp_id 起一次 build，不阻塞返回
    And 疑似同人待确认分支不触发

  Scenario: 触发失败不影响新增结果
    Given 一个有效且未用过的 candidate_id
    And 服务端异步 build 触发入队失败
    When 调用 add_hcp 传入该 candidate_id
    Then 工具结果仍为成功且记录已写入
    And 失败记入服务端日志、不在工具结果中报错

  Scenario: 洞察合成失败降级
    Given 某次 ensureDoingNow 的 LLM 调用失败
    When 调用方随后读取该 HCP 洞察
    Then 得到空模板与 pending 状态，而非 INTERNAL_ERROR
```

---

## 故事与功能追溯矩阵

| 用户故事 | F-MCP 覆盖 | 主要接口 | MVP |
|----------|------------|----------|-----|
| US-MCP-001 | 001–006、010、030–032、035 | I-MCP-007 | MVP-1 |
| US-MCP-002 | 008–009、011–014 | I-MCP-001 | MVP-1 |
| US-MCP-003 | 015–017 | I-MCP-006 | MVP-1 |
| US-MCP-004 | 007、025 | I-MCP-004、005 | MVP-1 |
| US-MCP-005 | 018–024、027–029 | I-MCP-002、003 | MVP-1 |
| US-MCP-006 | 026、028、033–034 | I-MCP-008–010 | MVP-1 |
| US-MCP-007 | 036–037 | 复用 I-MCP-002、003 | MVP-2.0 |

## 建议验收顺序

1. MVP-1：US-MCP-001 → 002 → 004 → 003 → 005 → 006  

## 相关文档

- 功能规格：[`mcp-function-spec.md`](./mcp-function-spec.md)  
- 设计：[`mcp-design.md`](./mcp-design.md)  
- 产品 MVP：[`../1.product-definition.md`](../1.product-definition.md)  
- 测试与 DoD：[`../7.test-strategy.md`](../7.test-strategy.md)  
- 数据字典：[`../5.hcp-twin-data-dictionary.md`](../5.hcp-twin-data-dictionary.md)  
- Web 故事：[`../app/app-stories.md`](../app/app-stories.md)
