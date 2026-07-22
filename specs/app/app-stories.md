# Web App 用户故事与验收标准（ATDD）

> as_of：2026-07-16  
> 依据：[`app-function-spec.md`](./app-function-spec.md)（F-WEB-*）  
> 角色默认：**药企 HCP 互动负责人**（代表 / MSL / 医学事务等，下文称「用户」）  
> 验收样例 HCP：复旦大学附属中山医院 **朱同玉** 教授（手工填写或 mock fixture；**新增录入页不预填**）  
> 写法：Given-When-Then；约束类辅以规则清单。场景用语面向业务，不绑定具体控件 ID / 路由实现。

## 文档约定

| 项 | 说明 |
|----|------|
| 故事编号 | `US-WEB-NNN` |
| 追溯 | 每条故事列出覆盖的 `F-WEB-*` |
| 完成定义 | 本文件 AC 全部通过，且符合 [`../7.test-strategy.md`](../7.test-strategy.md) SMART DoD |
| 实现批次 | 填 **MVP-1…MVP-4**，见 [`../1.product-definition.md`](../1.product-definition.md) |

---

## US-WEB-001 应用壳、多开姓名标签与标本索引

**As a** 药企 HCP 互动负责人  
**I want to** 在顶栏用「HCP数字分身 / 姓名标签 / Agent」管理多个已打开分身  
**So that** 我能并行查看多位医生，且洞察与一人一策始终绑在对应姓名标签下  

**覆盖**：F-WEB-001、F-WEB-002、F-WEB-003、F-WEB-004、F-WEB-045  

### 验收标准

```gherkin
Feature: 应用壳与多开分身标签

  Scenario: 列表态顶栏仅两入口
    Given 用户处于 HCP数字分身列表且未打开任何姓名标签
    When 页面完成加载
    Then 顶栏可见「HCP数字分身」与「HCP Engagement Agent」
    And 顶栏不出现「HCP洞察」「一人一策」全局入口
    And 标本索引为「—」

  Scenario: 打开分身后插入姓名标签并可进入工作台子 Tab
    Given 列表中有朱同玉的数字分身
    When 用户点击该行「打开」
    Then 顶栏在「HCP数字分身」与 Agent 之间出现「朱同玉」标签
    And 进入该分身工作台，默认可看到「HCP资料」
    And 可切换到「HCP洞察」「一人一策」
    And 标本索引显示「朱」或等价缩写

  Scenario: 可同时打开多位医生
    Given 用户已打开朱同玉姓名标签
    When 用户再打开另一位已建分身
    Then 顶栏同时保留两位姓名标签
    And 切换标签时工作台内容与该医生绑定、不串数据

  Scenario: 关闭姓名标签不删除数据
    Given 用户已打开朱同玉姓名标签
    When 用户悬停该标签并点击圆形关闭，或点击「关闭本页」
    Then 该姓名标签消失
    And 朱同玉仍保留在 HCP数字分身列表中
```

---

## US-WEB-002 浏览数字分身列表与级别标签

**As a** 药企 HCP 互动负责人  
**I want to** 以表格浏览已建数字分身及其级别标签与一句话洞察  
**So that** 我能快速挑选要跟进的医生  

**覆盖**：F-WEB-005、F-WEB-006  

### 验收标准

```gherkin
Feature: 数字分身列表

  Scenario: 列表展示关键列与合计
    Given 系统中已存在至少一位已保存的数字分身
    When 用户打开「HCP数字分身」列表
    Then 每行显示序号、姓名、分身标识、医院/科室、一句话洞察、级别标签、数据时点
    And 页面标题为「HCP列表」
    And 列表上方显示「共 N 位HCP」，N 与行数一致
    And 行操作仅有「打开」，无「修改」「删除」

  Scenario: 级别标签来自分身画像且数量受控
    Given 某分身具备主级别与多个角色标签
    When 用户查看该行或详情中的标签区
    Then 主级别与角色标签以对比底色展示
    And 至多显示一个主标与三个辅标
    And 标签含义不暗示处方潜力或统方相关分级

  Scenario: 空列表引导新增
    Given 系统中尚无任何数字分身
    When 用户打开「数字分身」列表
    Then 用户看到可理解的空状态说明
    And 用户能从该状态进入「新增数字分身»

  Scenario: 通用工作区占位不出现在列表
    Given 库中存在 open_chat 占位 Twin（hcp_id=_agent_general）
    When 用户打开「HCP数字分身」列表
    Then 列表不包含「通用工作区」或 `_agent_general`
    And 「共 N 位HCP」仅计真实医生分身
```

---

## US-WEB-003 查看、修改与删除数字分身详情

**As a** 药企 HCP 互动负责人  
**I want to** 查看分身详情（一句话洞察、文献号、职业轨迹），并修改基本信息或删除分身  
**So that** 我能维护准确身份锚点并清理不再跟进的对象  

**覆盖**：F-WEB-007、F-WEB-008、F-WEB-009、F-WEB-015、F-WEB-016、F-WEB-045、F-WEB-046  

### 验收标准

```gherkin
Feature: 分身工作台 · HCP资料与维护

  Background:
    Given 系统中已保存朱同玉的数字分身且具备基本画像
    And 界面语言为中文（zh-CN）

  Scenario: 打开工作台看到资料、文献号与中文职业轨迹
    When 用户从列表打开该分身
    Then 工作台展示 HCP资料 / HCP洞察 / 一人一策 子 Tab
    And HCP资料展示姓名、级别标签与一句话洞察
    And 展示文献检索号码表；未绑定项显示「待绑定」
    And 职业轨迹节点类型与职衔以中文展示（非裸英文 kind）
    And HCP资料常驻「智能体情报构建」区（标题与右上角构建按钮对齐）
    And 该区不出现在洞察/一人一策子 Tab
    And 无「收起进度」控件

  Scenario: 尚未构建情报时的空态
    Given 分身已确认保存但尚未完成 Stage A–E 情报构建
    When 用户打开 HCP资料
    Then 「智能体情报构建」区展示「尚无情报」
    And 按钮文案为「构建情报」

  Scenario: 已构建情报时展示完成态并可重建
    Given 分身已完成情报构建并写入 Postgres
    When 用户打开 HCP资料
    Then 「智能体情报构建」区展示「情报构建状态· Stage A–E 完成（100%）」及 A–E 完成列表
    And 按钮文案为「重新构建情报」
    When 用户点击「重新构建情报」
    Then 进度随 `get_twin_status` 更新，文案前缀为「情报构建状态·」

  Scenario: 一句话洞察与洞察子 Tab 同源
    Given 分身洞察中的「正在做什么」文案已生成
    When 用户分别在 HCP资料与 HCP洞察 查看一句话洞察
    Then 两处展示同一份摘要内容

  Scenario: 修改与删除在工作台完成
    Given 用户在该分身工作台
    When 用户经「修改」保存基本信息
    Then 回到 HCP资料且姓名标签仍打开
    When 用户确认「删除」
    Then 该分身从列表消失且姓名标签关闭

  Scenario: 顶栏切换界面语言后壳与职业轨迹随 locale 变化
    Given HCP资料展示中文职业轨迹且顶栏可见「中文 | English」
    When 用户点击 English
    Then 顶栏与工作台子 Tab 等 UI 壳文案切换为英文 catalog
    And 职业轨迹类型与可翻译职衔按英文 catalog 展示
    And `document.documentElement.lang` 为 `en`
    When 用户刷新页面
    Then 界面 locale 仍为英文（persist）

  Scenario: 一句话洞察中英分桶互不覆盖
    Given 中文界面下已合成中文一句话洞察
    When 用户切换到 English 并重新合成一句话洞察
    Then 英文界面展示英文摘要
    When 用户切回中文
    Then 仍展示原先中文一句话洞察（未被英文覆盖）
```

---

## US-WEB-004 查询 HCP、消歧候选并确认保存分身

**As a** 药企 HCP 互动负责人  
**I want to** 用姓名、医院、科室查询公开身份，从候选中确认后保存数字分身  
**So that** 我不会把同名医生建错，并能在列表与详情中继续管理该身份  

**覆盖**：F-WEB-010、F-WEB-011、F-WEB-012、F-WEB-013；构建进度 F-WEB-014 见详情「构建情报」（MVP-1）；知识按需 F-WEB-039 属 MVP-3  

### 验收标准

```gherkin
Feature: 新增数字分身（查询与确认）

  Scenario: 新增入口主操作为查询而非「构建」
    Given 用户在数字分身列表
    When 用户进入新增数字分身
    Then 主操作文案为「查询 HCP」
    And 不出现误导为「一键构建完成」的主按钮文案
    And 姓名、医院、科室、城市字段均为空（不预填朱同玉或其它样例）

  Scenario: 提交锚点后展示消歧候选（以人为主体）
    Given 用户在空白录入页自行填写姓名「朱同玉」、医院「复旦大学附属中山医院」、科室信息
    When 用户执行查询 HCP
    Then 系统展示一个或多个**医生**候选
    And 每条候选主标题为医生姓名，并可见医院、科室（或职称）
    And 「医院专家页 / OpenAlex」等仅作为命中依据次级展示，不得当作主标题
    And 有文献检索号时以「已关联」类次级标识展示（ORCID / PubMed / Scholar / OpenAlex 等）

  Scenario: 选择候选进入未入库预览
    Given 查询返回多个候选
    When 用户对正确人选点击「就是这位」
    Then 用户进入分身预览详情
    And 此时尚未作为已保存分身写入数据库并出现在列表的「已确认」集合中

  Scenario: 确认保存后写入列表（身份闭环）
    Given 用户在候选预览中确认身份无误
    When 用户确认并保存分身
    Then 该分身出现在数字分身列表
    And 「HCP洞察」与「一人一策」对该分身可用（门禁解锁；洞察内容属后续 MVP）
    And 确认保存本身**不**自动弹出虚假 Stage 进度（须用户显式「构建情报」）

  Scenario: 构建进行中可感知进度更新
    Given 分身已确认保存且用户已在「智能体情报构建」区触发构建
    When 用户停留在 HCP资料的常驻情报构建区
    Then 进度状态随 `get_twin_status` 推进更新，而不是内存 stub 或一直空白无反馈
    And 不出现「收起进度」；构建结束后区仍常驻并切回完成态或错误说明

  Scenario: 保存后可触发专科知识按需准备
    Given 分身已确认保存且带有可归一化的专科或主题信息
    When 保存流程完成
    Then 系统异步触发该专科 `ingest_on_demand` 并在响应中带回 knowledge_jobs（jobId / status）
    And 该过程不阻塞用户进入已保存分身工作台
    And 用户可在资料页或状态接口查询灌注进度

  Scenario: 无法消歧时给出可修复提示
    Given 查询未找到可信候选或用户拒绝所有候选
    When 用户结束该次查询
    Then 用户看到可操作的失败说明（例如补充链接或核对医院科室）
    And 系统未静默写入错误身份的分身
```

---

## US-WEB-005 阅读 HCP 洞察报表

**As a** 药企 HCP 互动负责人  
**I want to** 在选定分身后阅读结构化洞察：正在做什么、科研方向、活动热力、兴趣、机会与证据  
**So that** 我能基于证据准备互动，而不是凭印象猜测  

**覆盖**：F-WEB-017、F-WEB-018、F-WEB-019、F-WEB-020、F-WEB-021、F-WEB-022、F-WEB-023、F-WEB-024、F-WEB-025、F-WEB-045  

### 验收标准

```gherkin
Feature: HCP 洞察

  Background:
    Given 用户已选定朱同玉的数字分身且洞察数据可用

  Scenario: 洞察页展示身份元数据
    When 用户打开 HCP 洞察
    Then 页面展示姓名、级别标签、数据时点与分身版本
    And 可选提供导出入口

  Scenario: 洞察嵌于分身工作台
    When 用户在已打开的朱同玉工作台切换到 HCP洞察
    Then 不显示「返回朱同玉数字分身」条
    And 顶栏仍保留「朱同玉」姓名标签

  Scenario: 一句话洞察含摘要与可选分析
    When 用户查看「正在做什么」区块
    Then 展示简明摘要
    And 若存在分析段落则一并展示
    And 文案与数字分身详情中的一句话洞察同源

  Scenario: 科研方向下列出成果并可链出
    Given 洞察中包含至少一个科研主题
    When 用户浏览科研方向与成果
    Then 每个方向下列出相关著作、荣誉或认可等成果
    And 具备公开链接的成果可打开来源

  Scenario: 活动热力四窗格不捏造高峰
    When 用户查看活动热力表
    Then 表头包含更早、90天、60天、30天四个时间窗
    And 有证据的单元格显示日期、地点与活动名称（可链接）
    And 无公开证据的时间窗显示「无公开证据」，不绘制虚假活动高峰

  Scenario: 已知近期学术活动独立列出
    Given 存在近窗外或已知名的学术活动记录
    When 用户查看已知近期学术活动
    Then 条目以日期、地点、名称展示且可链到来源

  Scenario: 兴趣方向为多轴叙述而非标签堆砌
    When 用户查看兴趣方向
    Then 每一项包含标题与分析说明
    And 可含分桶或合规旁注
    And 不以无解释的标签云作为唯一呈现

  Scenario: 可能的机会可执行且含边界
    When 用户查看可能的机会
    Then 每条机会展示优先级、建议负责人或渠道
    And 展示「不假设」或边界说明，避免越权承诺

  Scenario: 证据表可追溯
    When 用户打开证据与来源表
    Then 来源名称可打开对应 URL（若有）
    And 显示置信与数据时点

  Scenario: KPI 摘要克制
    When 用户查看洞察页摘要指标
    Then 指标数量不超过三个
    And 不以大色块卡片墙作为主视觉
```

---

## US-WEB-006 生成与修订一人一策方案

**As a** 药企 HCP 互动负责人  
**I want to** 基于当前洞察生成 3–5 条 Engagement 方案，送合规闸门检查，并用页底短对话修订当前方案  
**So that** 我能拿到可执行、可引证、经合规提示的互动建议  

**覆盖**：F-WEB-026、F-WEB-027、F-WEB-028、F-WEB-029、F-WEB-045  

### 验收标准

```gherkin
Feature: 一人一策

  Background:
    Given 用户已打开具备洞察的数字分身工作台

  Scenario: 一人一策嵌于工作台
    When 用户切换到一人一策子 Tab
    Then 不显示「返回数字分身」条
    And 仍可通过顶栏姓名标签或「关闭本页」离开工作台

  Scenario: 方案以选项卡展示完整字段
    Given 已存在 3 至 5 条 Engagement 方案
    When 用户打开一人一策
    Then 方案以水平选项卡切换
    And 当前方案内容区包含动作、负责人、渠道、主题、成功信号、合规旁注、优先级与引用

  Scenario: 生成方案基于当前分身洞察
    Given 当前分身尚无方案或用户请求重新生成
    When 用户触发「生成方案」
    Then 系统基于该分身洞察与机会生成 3 至 5 条方案并保存
    And 用户能在选项卡中浏览新方案
    And 方案带有学术与合规相关引用信息（有则展示）

  Scenario: 送合规闸门得到结构化结果
    Given 用户已选定一条方案
    When 用户触发「送合规闸门检查」
    Then 用户看到通过、附条件或拒绝之一的结构化结果
    And 结果说明可被业务人员理解，不替代正式 MLR 签批

  Scenario: 页底短对话只修订当前方案
    Given 用户正在查看某一方案选项卡
    When 用户在页底与助手讨论并发送修订意见
    Then 对话按「修订当前方案」模式处理，并绑定该方案
    And 修订结果反映在当前方案内容中或会话记录中
    And 该方案选项卡的聊天记录保存在本机浏览器，刷新后可恢复
    And 需要完整开放对话时，用户可被引导至 HCP Engagement Agent

  Scenario: Twin 未就绪时不可空跑生成
    Given 当前未选定分身或洞察尚未可用
    When 用户试图生成方案
    Then 系统拒绝空跑并给出可理解提示
```

---

## US-WEB-007 使用 HCP Engagement Agent 开放对话

**As a** 药企 HCP 互动负责人  
**I want to** 在独立 Agent 工作面进行**通用**开放多轮对话，管理历史会话、上传附件，并可选流式阅读回复  
**So that** 我能做疾病领域找人、渠道/合规与访前讨论，且与一人一策短修订互不混用、也不被「当前分身」绑死  

**覆盖**：F-WEB-030、F-WEB-031、F-WEB-032、F-WEB-033、F-WEB-034  

### 验收标准

```gherkin
Feature: HCP Engagement Agent

  Scenario: 开放对话与一人一策修订模式分离
    Given 用户在 HCP Engagement Agent 发起新对话
    When 用户发送一条通用问题（如疾病领域找人、渠道合规）
    Then 该会话按开放对话模式处理，且不默认绑定顶栏/工作台「当前分身」
    And 不与一人一策页底「修订当前方案」会话混用同一会话身份

  Scenario: 历史会话可新建与回看
    Given 用户曾与 Agent 有过至少一轮对话
    When 用户打开会话历史
    Then 用户能看到历史会话列表并新建会话
    And 历史索引与消息正文在浏览器 localStorage 持久化，刷新后仍可找回

  Scenario: 等待回复有可见反馈
    Given 用户已发送一条消息且助手尚未返回
    Then 界面显示「正在回复」类 typing 提示
    And 输入提示说明 Enter 发送、Shift+Enter 换行

  Scenario: 附件随轮次提交
    Given 用户在输入区选择上传附件
    When 用户发送该轮消息
    Then 界面展示附件名称列表
    And 该轮上下文包含这些附件供助手使用（在产品允许范围内）

  Scenario: 对话面板可调整尺寸且有下限
    Given 用户打开 Agent 对话面板
    When 用户拖动面板调整手柄改变宽高
    Then 面板尺寸随之变化
    And 尺寸不低于产品规定的最小宽高

  Scenario: 流式回复时每轮可持久化
    Given 系统启用流式回复
    When 助手生成较长回答
    Then 用户能看到逐步出现的回复内容
    And 该轮对话写入数据库，之后可从历史再次打开

  Scenario: 回复呈现克制可读
    When 助手返回含 Markdown 的内容
    Then 消息以对话气泡形式展示
    And 标题层级克制，符合产品 UI 指南
```

---

## US-WEB-009 分身英文名补齐与展示

**As a** 药企 HCP 互动负责人  
**I want to** 在消歧确认与情报构建后看到文献侧英文名（Given Family），并在资料中核对  
**So that** 列表/资料可辨认国际文献名，且不出现无证据的假英文名  

**覆盖**：F-WEB-047（及 F-WEB-011、F-WEB-013、F-WEB-014 展示相关）  

### 验收标准

```gherkin
Feature: 分身英文名补齐

  Scenario: 消歧候选带文献英文名
    Given live resolve 命中 OpenAlex 作者 display_name 为 "Changxi Wang"
    When 用户查看候选
    Then 可见中文名与英文名 Changxi Wang
    And 确认保存后 Twin.profile.name_en 为 "Changxi Wang"

  Scenario: 构建时回填缺失的 name_en
    Given 已保存分身 name_zh 有值且 name_en 为空
    And build Stage A 匹配到 OpenAlex 作者且 display_name 可信
    When 情报构建完成
    Then Twin.profile.name_en 与 identity.name_en 已回填为 Given Family 拉丁名

  Scenario: CJK name_en 视为空并回填拉丁名
    Given 库内 name_en 误存为汉字（与 name_zh 相同）
    And OpenAlex 当前簇仅有中文 display_name
    When Stage A 或 translate:en 以拼音 Given Family 检索到拉丁作者簇
    Then name_en 写为拉丁名（如 Changxi Wang）
    And UI 次级展示该拉丁名（不再隐藏）

  Scenario: 无文献英文名时不编造
    Given 构建未得到可信拉丁名
    When 用户查看 HCP资料
    Then 不展示伪造英文名；name_en 保持空

  Scenario: 编辑可人工校正英文名
    Given 用户在修改分身页
    When 用户填写或清空英文名并保存
    Then Twin 的 name_en 按提交结果更新
```

---

## US-WEB-008 安全边界、错误态、导出与无障碍（横切）

**As a** 药企 HCP 互动负责人  
**I want to** 在浏览器内只通过应用服务访问能力，并在失败时得到可修复提示；在需要时导出洞察，且界面可键盘与小屏使用  
**So that** 密钥与内部服务不暴露在浏览器，日常使用可恢复、可交付、可访问  

**覆盖**：F-WEB-035、F-WEB-036、F-WEB-037、F-WEB-038、F-WEB-040、F-WEB-041、F-WEB-042、F-WEB-043  

### 验收标准

```gherkin
Feature: 横切质量与安全边界

  Scenario: 浏览器不直连采集、向量库或大模型密钥
    Given 用户在浏览器中使用应用全部功能
    When 安全审查检查网络请求目标
    Then 业务请求仅发往应用自身的服务接口
    And 浏览器侧不持有大模型密钥，也不直连 MCP 或向量库

  Scenario: 分身与洞察变更经服务校验后入库
    Given 用户创建、更新或删除分身，或读取洞察、生成方案、对话、合成一句话洞察
    When 操作成功完成
    Then 数据经服务端校验后写入或读取远程 MySQL
    And 非法输入被拒绝并返回可理解错误，不产生半截脏记录

  Scenario: 失败提示可修复且无装饰性符号堆砌
    Given 出现未消歧、未绑文献号或服务暂不可用等情况
    When 用户看到错误或空状态
    Then 文案说明原因与下一步可操作建议
    And 不使用 emoji 作为状态装饰

  Scenario: 洞察导出适合打印阅读
    Given 用户在洞察页触发导出
    When 导出或打印预览生成
    Then 导航等干扰元素被隐藏或弱化
    And 表格与时间轴等证据内容得以保留

  Scenario: 键盘与小屏可用性基线
    Given 用户使用键盘或窄屏设备
    When 用户浏览列表、热力表与 Agent 历史
    Then 可聚焦控件具备可见焦点
    And 对比度满足 AA 基线
    And 用户开启减少动效偏好时，非必要动画减弱或关闭
    And 小屏上热力表可横向滚动；Agent 历史以抽屉或等价紧凑形态呈现

  Scenario: 启用租户时产品上下文不写入分身本体
    Given 组织启用了登录与租户上下文
    When 用户在租户下查看分身并生成一人一策
    Then 产品或 SOP 上下文作用于方案与检索过滤
    And 分身本体记录不混入租户产品私有字段作为 Twin 主数据
```

---

## 故事与功能追溯矩阵

| 用户故事 | F-WEB 覆盖 | MVP |
|----------|------------|-----|
| US-WEB-001 | 001–004、045 | MVP-1 |
| US-WEB-002 | 005–006 | MVP-1 |
| US-WEB-003 | 007–009、015–016、045–046 | MVP-1 |
| US-WEB-004 | 010–014（查询保存 + 构建进度）；039 属 MVP-3 | MVP-1 |
| US-WEB-005 | 017–025、045 | MVP-2 |
| US-WEB-006 | 026–029、045 | MVP-4 |
| US-WEB-007 | 030–034 | MVP-4 |
| US-WEB-008 | 035–038、040–043 | MVP-1（035–036、040）· MVP-2（037）· MVP-4（038、042–043） |

## 建议验收顺序

1. MVP-1：US-WEB-001 → 002 → 004（查询保存 + 构建进度）→ 003  
2. MVP-2：US-WEB-005（fixture Insights 可验收）  
3. MVP-3：知识库（合规 + 学术）  
4. MVP-4：US-WEB-006 → 007；US-WEB-008 横切（BFF 边界自 MVP-1 强制）  

## 相关文档

- 功能规格：[`app-function-spec.md`](./app-function-spec.md)  
- 产品 MVP：[`../1.product-definition.md`](../1.product-definition.md)  
- 测试与 DoD：[`../7.test-strategy.md`](../7.test-strategy.md)  
- UI：[`../6.ui-guideline.md`](../6.ui-guideline.md)  
- UI 原型：[`hcp-ui-prototype.canvas.tsx`](./hcp-ui-prototype.canvas.tsx)（状态：[`hcp-ui-prototype.canvas.data.json`](./hcp-ui-prototype.canvas.data.json)）
