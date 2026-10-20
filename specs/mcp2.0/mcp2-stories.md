# 对外 MCP 2.0 用户故事与验收标准（ATDD）

> as_of：2026-10-20（US-MCP2-006 补写前模糊查重与确认语义，ADR-009；OGT-1 并入库外检索与候选令牌，ADR-010，改写 US-MCP2-004 / US-MCP2-006；医院/科室过滤包含匹配，ADR-011；ADR-012 数据面口径：US-MCP2-002 / US-MCP2-003 改为洞察与学术证据、合规条款检索）  
> 依据：[product-backlog.md](../product-backlog.md#external-service)、[mcp2-design.md](./mcp2-design.md)  
> 角色：**MCP 调用方**（集成工程师 / 宿主 Agent）  
> 样例 HCP：朱同玉 fixture（与 [7.test-strategy.md](../spec1.0/7.test-strategy.md) 一致）

## 文档约定

| 项 | 说明 |
| --- | --- |
| 故事编号 | `US-MCP2-NNN` |
| 完成定义 | 本文件 AC + [mcp2-test.md](./mcp2-test.md) + `sdd-dod.mdc` |
| 批次 | Sprint 1–3，对齐 sprint-backlog Feature SBI |

---

## US-MCP2-001 进程骨架与三工具注册（Sprint 1）

**As a** MCP 调用方  
**I want to** 连接对外 MCP 并发现 `list_hcp`、`query_hcp`、`add_hcp`  
**So that** 可在无 Web UI 下维护 HCP 主数据  

**覆盖**：Sprint 1 `task-01`（`feature-01` 见 US-MCP2-004）

### 验收标准

```gherkin
Feature: MCP 2.0 壳与 Sprint 1 工具

  Scenario: 工具列表含主数据三工具
    Given 对外 MCP 进程已按文档启动
    When 调用方列出 tools
    Then 包含 list_hcp、query_hcp、add_hcp
    And 各 tool 的 inputSchema 与 product-backlog 参数说明一致

  Scenario: list_hcp 返回全量已保存列表
    Given 库中存在至少一条已保存 HCP 且不含 _agent_general
    When 调用 list_hcp
    Then 返回 count 与 items 且 items 含 hcp_id 与列表字段

  Scenario: 仅 Streamable HTTP 可接入（ADR-008）
    Given 对外 MCP 进程已启动并监听 MCP2_PORT
    When 调用方以 MCP url 方式连接 /mcp
    Then initialize 握手成功且可列出工具
    And GET /health 返回 {ok: true, service: "hcp-engagement-mcp"}
    When 调用方尝试 stdio 子进程方式接入
    Then 无可用接入方式（stdio 已随 ADR-008 从代码移除）
```

---

## US-MCP2-004 按条件查询已保存 HCP（Sprint 1）

**As a** MCP 调用方  
**I want to** 用编号或姓名在已保存医生中查找，需要时一并检索库外候选  
**So that** 命中几位就拿到几位完整数字分身，库外候选人经人选认后可用于新增，而不打开 Web  

**覆盖**：Sprint 1 `feature-01` · [MCP2-01](../product-backlog.md#pb-1)

### 验收标准

```gherkin
Feature: query_hcp

  Scenario: 按 hcp_id 返回一位完整分身
    Given 库中已保存该 hcp_id 且不是 _agent_general
    When 调用 query_hcp 并传入该 hcp_id
    Then 返回 count 等于 1
    And items 长度为 1 且含该医生的完整数字分身
    And 响应无密钥、无堆栈、无内网路径

  Scenario: 仅传姓名且多名命中
    Given 库中至少两位已保存医生的中文名、英文名或拼音可被同一 name 命中
    When 调用 query_hcp 仅传 name
    Then 返回 count 大于 1 且 items 长度等于 count
    And 每条为完整数字分身

  Scenario: 姓名加医院缩小范围
    Given 同名医生分属不同医院
    When 调用 query_hcp 传入 name 与其中一家 hospital
    Then items 只含该医院的命中

  Scenario: 英文名名在前仍命中
    Given 已保存医生的英文名或中文名拼音是姓在前
    When 调用 query_hcp 传入名在前的拉丁姓名
    Then 返回 count 大于等于 1
    And items 含该医生的完整数字分身

  Scenario: 逗号写成姓在前仍命中
    Given 已保存医生的英文名或拼音是名在前，例如 Wenhong Zhang
    When 调用 query_hcp 传入 zhang, wenhong
    Then items 含该医生的完整数字分身

  Scenario: 全角逗号与半角逗号同样命中
    Given 已保存医生的英文名或拼音是名在前
    When 调用 query_hcp 传入用全角逗号分开的姓和名
    Then items 含该医生的完整数字分身

  Scenario: 连字符去掉后与英文名相同
    Given 已保存医生的英文名是 Wenhong Zhang
    When 调用 query_hcp 传入 Wen-hong Zhang
    Then items 含该医生的完整数字分身

  Scenario: 撇号去掉后与英文名相同
    Given 已保存医生的英文名在去掉撇号后与查询相同
    When 调用 query_hcp 传入带直撇号或弯撇号的拉丁姓名
    Then items 含该医生的完整数字分身

  Scenario: 行首称谓去掉后命中
    Given 已保存医生的英文名是 Yaling Han
    When 调用 query_hcp 传入 Dr. Yaling Han
    Then items 含该医生的完整数字分身

  Scenario: 逗号形式倒序后差一个字母仍命中
    Given 已保存医生的英文名是 Wenhong Zhang
    When 调用 query_hcp 传入 zhang, wenhon
    Then items 含该医生的完整数字分身

  Scenario: 句点缩写不命中全名
    Given 已保存医生的英文名是 Yaling Han
    When 调用 query_hcp 传入 Y. Han
    Then 不因缩写规则命中该医生

  Scenario: 行尾称谓不去掉
    Given 已保存医生的英文名是 Yaling Han
    When 调用 query_hcp 传入 Yaling Han, MD
    Then 不因称谓规则命中该医生

  Scenario: 逗号后没有第二段时不互换
    Given 库中没有英文名或拼音归一后等于 zhang 的医生
    When 调用 query_hcp 传入 zhang,
    Then 返回 count 等于 0 且 items 为空数组

  Scenario: 拉丁全名差一个字母仍命中
    Given 已保存医生的英文名或拼音在去空格、转小写后长度至少为 6
    When 调用 query_hcp 传入与该全名相差 1 次编辑的拉丁全名
    Then items 含该医生的完整数字分身

  Scenario: 过短拉丁名不做模糊
    Given 库中存在英文名里含有该短串的医生
    And 该短串去空格后少于 6 个字母
    When 调用 query_hcp 仅传该短串
    Then 不因模糊规则命中该医生

  Scenario: 拉丁全名相差两次及以上不命中
    Given 查询在去掉行首称谓、逗号、连字符和撇号之后，与该医生的英文名、拼音相差至少 2 次编辑
    And 词序互换后仍至少相差 2 次编辑
    When 调用 query_hcp 仅传该查询
    Then 返回 count 等于 0 且 items 为空数组
    And 不是错误响应

  Scenario: 无匹配
    Given 库中没有与该 name 匹配的已保存医生
    When 调用 query_hcp 仅传 name
    Then 返回 count 等于 0 且 items 为空数组
    And 不是错误响应

  Scenario: 缺少编号和姓名
    When 调用 query_hcp 且 hcp_id 与 name 都未传
    Then 工具结果为失败
    And 错误码为 VALIDATION_ERROR
    And 响应无堆栈

  Scenario: 指定编号不存在
    Given 该 hcp_id 不在库中，或该编号是 _agent_general
    When 调用 query_hcp 并传入该 hcp_id
    Then 错误码为 NOT_FOUND

  Scenario: 请求库外候选时双源返回
    Given include_external 为 true
    And 调用方同时传了 hospital 与 department
    And 对内 resolve 可检出该姓名的库外候选
    When 调用 query_hcp 传 name、hospital 与 department 与 include_external
    Then 库内结果照常返回
    And 返回 external 块且其中每个候选项含 candidate_id

  Scenario: 缺医院或科室时不发起库外检索
    Given include_external 为 true
    And hospital 与 department 缺其一
    When 调用 query_hcp
    Then 工具结果为成功且库内结果照常返回
    And external.count 为 0 并附提示
    And 未发起库外检索

  Scenario: 外源失败降级为仅库内
    Given include_external 为 true
    And 对内 hcp-twin-mcp 不在线或 resolve 失败
    When 调用 query_hcp
    Then 工具结果为成功且库内结果照常返回
    And external.count 为 0 并附降级提示
    And 不是错误响应

  Scenario: 库外候选与库内同人不重复
    Given 库内已保存该医生且对内 resolve 也检出该人
    When 调用 query_hcp 传该 name 与 include_external
    Then external.items 不含该医生的重复候选

  Scenario: 默认不传 include_external 时不发起库外检索
    When 调用 query_hcp 未传 include_external
    Then 只查库内且不发起库外检索

  Scenario: 医院短式包含命中
    Given 已保存医生的 hospital 为 北京协和医院
    When 调用 query_hcp 传命中该医生姓名的 name 与 hospital 协和医院
    Then items 含该医生

  Scenario: 过短医院词不触发包含
    Given 已保存医生的 hospital 为 北京协和医院
    When 调用 query_hcp 传命中该医生姓名的 name 与 hospital 协和
    Then 返回 count 等于 0 且 items 为空数组

  Scenario: 科室短词包含命中
    Given 已保存医生的 department 为 肝胆外科
    When 调用 query_hcp 传命中该医生姓名的 name 与 department 外科
    Then items 含该医生

  Scenario: 城市仍归一精确
    Given 已保存医生的 city 为 武汉
    When 调用 query_hcp 传命中该医生姓名的 name 与 city 武汉市
    Then 返回 count 等于 0 且 items 为空数组
```

---

## US-MCP2-005 列出全部已保存 HCP（Sprint 1）

**As a** MCP 调用方  
**I want to** 一次拿到全部已保存医生的列表  
**So that** 不打开 Web 就能浏览医生主数据并挑选下一步操作对象  

**覆盖**：Sprint 1 `feature-02` · [MCP2-06](../product-backlog.md#pb-7)  
**说明**：US-MCP2-001 的「list_hcp 返回全量已保存列表」场景由本故事细化承接。

### 验收标准

```gherkin
Feature: list_hcp

  Scenario: 返回全部已保存医生
    Given 库中存在多条已保存医生
    When 调用 list_hcp 且不传任何参数
    Then 返回 count 等于已保存医生总数
    And items 长度等于 count
    And 每条含 hcp_id、姓名、医院、科室、as_of 等列表字段
    And 响应无密钥、无堆栈、无内网路径

  Scenario: 不含通用工作区占位
    Given 库中存在 _agent_general 占位记录与至少一位真实医生
    When 调用 list_hcp
    Then items 不含 hcp_id 为 _agent_general 的条目
    And count 不计入 _agent_general

  Scenario: 列表字段与 Web 分身列表同源
    Given 库中存在已保存医生
    When 调用 list_hcp
    Then items 各条字段与 Web「HCP 列表」展示字段一致（含一句话洞察摘要）
    And 不返回 Twin 全文的其余深层块

  Scenario: 空库返回空列表
    Given 库中没有已保存医生
    When 调用 list_hcp
    Then 返回 count 等于 0 且 items 为空数组
    And 不是错误响应

  Scenario: 库异常返回结构化错误
    Given MySQL 不可用或查询失败
    When 调用 list_hcp
    Then 工具结果为失败
    And 错误码为 INTERNAL_ERROR
    And 响应无堆栈、无连接串

  Scenario: 只读工具不写库
    Given 库中存在已保存医生
    When 调用 list_hcp
    Then 该工具 annotations 的 readOnlyHint 为 true
    And 调用前后库内记录无变化
```

---

## US-MCP2-006 新增已保存 HCP（Sprint 1）

**As a** MCP 调用方  
**I want to** 在不打开 Web 的情况下把一位 query_hcp 检出、经人选认的库外医生新增为主数据  
**So that** 后续可在该医生上做查询、洞察与一人一策  

**覆盖**：Sprint 1 `feature-03` · Sprint 2 `feature-05` 联动（ADR-013）· [MCP2-02](../product-backlog.md#pb-2)
**约束**：新增来源限库外候选令牌，入参只收 `candidate_id`（[ADR-010](../../docs/adr/ADR-010-external-resolve-and-candidate-token.md)）；写入前走 ADR-009 同名查重；写库成功后异步触发刷新（[ADR-013](../../docs/adr/ADR-013-insight-synthesis-triggers.md)）。

### 验收标准

```gherkin
Feature: add_hcp

  Scenario: 按人选认候选新增并返回分身
    Given query_hcp 库外检索已检出一位候选且人选认其一
    And 该候选尚未入保存库
    When 调用 add_hcp 仅传所选 candidate_id
    Then 工具结果为成功
    And 返回 twin 与 hcp_id
    And twin 的 identity 含候选载荷中的姓名、医院、科室
    And 响应无密钥、无堆栈、无内网路径

  Scenario: 新增后可立即按编号查到
    Given add_hcp 刚按某 candidate_id 成功写入
    When 调用 query_hcp 传入返回的 hcp_id
    Then 返回 count 等于 1 且 items 含该医生的完整分身

  Scenario: 写入不阻塞构建并异步触发刷新
    Given 一个有效且未用过的 candidate_id
    When 调用 add_hcp 传入该 candidate_id
    Then twin_version 为 1 且 insights 为空模板（无 doing_now 摘要、无机会列表）
    And 返回含 refresh.run_id 供 get_twin_status 查询进度
    And 服务端异步对该 hcp_id 起一次 build，不阻塞本次返回
    And 响应不含 knowledge_jobs 键

  Scenario: 触发失败不影响新增结果
    Given 一个有效且未用过的 candidate_id
    And 服务端异步 build 触发入队失败
    When 调用 add_hcp 传入该 candidate_id
    Then 工具结果仍为成功且记录已写入
    And 失败记入服务端日志、不在工具结果中报错

  Scenario: 令牌无效则拒绝
    When 调用 add_hcp 传入未签发、已过期或已作废的 candidate_id
    Then 错误码为 NOT_FOUND
    And repair_hint 指明重新 query_hcp 检出候选并经人选认后重试
    And 库中未新增记录

  Scenario: 写入成功后令牌作废
    Given add_hcp 刚按某 candidate_id 成功写入
    When 再次调用 add_hcp 传同一 candidate_id
    Then 错误码为 NOT_FOUND 且库中无第二份记录

  Scenario: 编号已存在不覆盖
    Given 令牌缓存中某候选的派生 hcp_id 与库内已保存医生相同
    When 调用 add_hcp 传该 candidate_id
    Then 错误码为 VALIDATION_ERROR
    And 库中该医生的原有分身未被改动

  Scenario: 同名疑似同人先拦截待确认
    Given 令牌缓存中某候选的姓名按 query_hcp 姓名规则可命中一位编号不同的已保存医生
    When 调用 add_hcp 传该 candidate_id 且未传 confirm_not_duplicate
    Then 工具结果为非错误
    And status 为 confirmation_required
    And possible_duplicates 含该医生的 hcp_id、姓名、医院、科室与命中档位
    And 库中未新增记录

  Scenario: 确认非重复后仍可写入
    Given 上一次 add_hcp 返回 confirmation_required
    When 调用 add_hcp 传同一 candidate_id 与 confirm_not_duplicate 为 true
    Then 写入成功并返回 twin 与 hcp_id

  Scenario: 英文名档位同样参与查重
    Given 库中已存在英文名与候选所载英文名按 query_hcp 拉丁规则命中的医生
    When 调用 add_hcp 传该 candidate_id
    Then status 为 confirmation_required 且 possible_duplicates 含该医生

  Scenario: 疑似列表医院相同者排序在前
    Given 库中存在两位编号不同但姓名均命中该候选的已保存医生
    And 其中一位的 hospital 归一后与候选所载 hospital 相等
    When 调用 add_hcp 传该 candidate_id 且未传 confirm_not_duplicate
    Then possible_duplicates 中医院相同者排在医院不同的命中之前
    And 库中未新增记录

  Scenario: 占位编号不可新增
    Given 令牌缓存中某候选的派生 hcp_id 为 _agent_general
    When 调用 add_hcp 传该 candidate_id
    Then 错误码为 VALIDATION_ERROR

  Scenario: 候选文献号按 ADR-004 落库
    Given 令牌缓存中的候选携带公开源文献号
    When 调用 add_hcp 传该 candidate_id
    Then twin 的 research.author_ids 落主 ID 与 openalex_aliases（去重且不含主 ID）
    And profile.external_ids 与其镜像一致

  Scenario: 缺少 candidate_id
    When 调用 add_hcp 且未传 candidate_id
    Then 错误码为 VALIDATION_ERROR
    And 响应无堆栈

  Scenario: 库异常返回结构化错误
    Given MySQL 不可用或写库失败
    When 调用 add_hcp 传一个有效 candidate_id
    Then 错误码为 INTERNAL_ERROR
    And 响应无堆栈、无连接串

  Scenario: 写库工具注记为非只读且非幂等
    When 调用方列出 tools
    Then add_hcp 的 annotations.readOnlyHint 为 false
    And 重复写入同一医生被令牌作废与查重拦截，不产生第二份记录
```

---

## US-MCP2-002 洞察与学术证据（Sprint 2）

**覆盖**：`get_hcp_insights`、`retrieve_academic`（[ADR-012](../../docs/adr/ADR-012-mcp2-data-plane-only.md)：一人一策不经对外 MCP） · AGT2-01 同批验收

```gherkin
  Scenario: get_hcp_insights 返回 doing_now
    Given 目标 hcp_id 已有 twin 与 insights
    When 调用 get_hcp_insights
    Then 返回 twin 与 insights 且 doing_now.summary 非空

  Scenario: retrieve_academic 返回带引用的学术证据
    Given 目标 hcp_id 已有 twin
    When 调用 retrieve_academic
    Then 返回 chunks 且每条含 citation
    And 响应不含方案生成结果、不写库
```

---

## US-MCP2-003 合规条款检索（Sprint 3）

**覆盖**：`retrieve_compliance`（[ADR-012](../../docs/adr/ADR-012-mcp2-data-plane-only.md)：预审不经对外 MCP）

```gherkin
  Scenario: 检索返回条款引用
    Given 目标 hcp_id 已有 twin
    When 调用 retrieve_compliance
    Then 返回 chunks 且每条含 clause_id、authority、version
    And 工具 description 声明不是预审判定、不替代正式 MLR
    And 请求不携带 tenant_id；租户鉴权未上线时仅返回全局种子
```
