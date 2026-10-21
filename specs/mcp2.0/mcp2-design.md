# 对外 MCP 2.0 设计

> as_of：2026-10-21（新增 §7 feature-02 list_hcp；新增 §8 feature-03 add_hcp，含写前查重 ADR-009；OGT-1 并入库外检索与候选令牌，ADR-010；医院/科室过滤包含匹配，ADR-011；ADR-012 对外仅数据面：MCP2-04/05 改 `retrieve_academic` / `retrieve_compliance`；2026-10-21 §9 精化：ensureDoingNow 已随 feature-05 落地，返回形状与 NOT_FOUND 预检定稿；新增 §10 feature-02 retrieve_academic 与 §11 feature-04 retrieve_compliance 技术设计：底层 medical-kb 检索已落地，外部工具只接线；2026-10-21 新增 §12 feature-07 知识覆盖对齐：add_hcp 预灌 + retrieve_academic coverage 信号，ADR-014，triggerKnowledgeIngest 提取入 medical-kb；新增 §13 feature-11 科室来源标注与预灌映射预览：MCP2-09 / DEF-005；2026-10-21 §13 增补 13.6：入库科室以选中记录信号专科为准，MCP2-10 / DEF-006（D2）；同日 §13.5 增补 B+ 设计：论文级概念懒加载补信号与 query_hcp 卡片主题词/科室判断展示；同日 §11 增补：retrieve_compliance coverage 透传，[MKB2-03](../product-backlog.md#pb-13)，契约与 [rag-design §19](../rag/rag-design.md) 同批验收；同日 feature-04 开工准备批次：§3 retrieve_compliance 行 Sprint 归属改 Sprint 2（Sprint 3 已按 Option A 并入）；同日 feature-08 开工准备批次：新增 §14 `ingest_academic` / `get_ingest_status` 技术设计（MCP2-08，ADR-014 决策 3），§2 / §3 工具映射同步补两工具）  
> 需求与工具契约：[product-backlog.md](../product-backlog.md#external-service)  
> 对内采集 MCP：[mcp-design.md](../mcp/mcp-design.md) · [mcp-function-spec.md](../mcp/mcp-function-spec.md)  
> 架构：[3.architecture.md](../spec1.0/3.architecture.md)

## 1. 边界

```text
调用方（Cursor / 企业 Agent）
        │  MCP 2.0（本设计）
        ▼
  @hca/db · @hca/hcp-engagement-agent · @hca/medical-kb
        │
        ✕ build / collectors 不暴露（resolve 仅由 query_hcp 经 HTTP 受控复用，ADR-010）
```

- Twin 内容刷新：后台 TWIN2-01，无对外「构建」工具。
- 决策面不暴露（ADR-012）：`propose_engagement_options` / `precheck_compliance` 不对外；方案生成与合规预审仅经服务器内嵌 agent + Web App。
- 库外候选检索：`query_hcp` `include_external` 时经 HTTP 调对内 `resolve_hcp_identity`（ADR-010）；对内 MCP 不在线时降级为仅库内。
- 工具名、入参、返回、Annotations：以 product-backlog「MCP」list 为准。

## 2. 进程与包（目标形态）

| 项 | 说明 |
| --- | --- |
| 包名（定稿） | `@hca/hcp-engagement-mcp`（`packages/hcp-engagement-mcp`，task-01 已建） |
| Transport（定稿，ADR-008） | 仅 Streamable HTTP（stdio 已按 [ADR-008](../../docs/adr/ADR-008-mcp2-http-only-transport.md) 移除）；端口 `MCP2_PORT`（缺省 `3300`），`GET /health` 返回 `{ok, service}`；客户端经 `url` 接入；日志走 stderr |
| 注册 | 工具集分三 sprint 落地（ADR-014 增补 `ingest_academic` / `get_ingest_status`，feature-08）；handler 调共享库，不复制 BFF 路由逻辑。task-01 已注册 `list_hcp`/`query_hcp`/`add_hcp`（stub handler 返回结构化 `INTERNAL_ERROR`） |
| 配置 | `DATABASE_URL`、LLM/RAG 与 Web 同源 env；密钥仅进程环境。2.0 专属键：`MCP2_PORT`、`TWIN_REFRESH_CRON`、`TWIN_REFRESH_TTL_HOURS`（`MCP2_TRANSPORT` 已随 stdio 移除）；`MCP_URL`（对内 hcp-twin-mcp HTTP 基址，库外检索数据源，ADR-010） |

## 3. 工具 → 依赖映射

| 工具 | 读/写 | 主要依赖 |
| --- | --- | --- |
| `list_hcp` | 读 | `@hca/db` `listTwins` |
| `query_hcp` | 读 | `@hca/db` `queryTwins`（`hcp_id` 走 `getTwin`；姓名过滤见 §6）；`include_external` → 对内 `resolve_hcp_identity`（HTTP，ADR-010，见 §6 增补） |
| `add_hcp` | 写 + 异步触发刷新（ADR-013） | 候选令牌（ADR-010）→ 确认保存路径（对齐 `/api/twins/confirm`）；写库成功后异步起一次 build，返回 `refresh: { run_id }`（详见 §8 增补） |
| `get_hcp_insights` | 读 + 按需幂等回填（ADR-013） | `@hca/db` insights + twin；空模板且事实足够时服务器内经 `ensureDoingNow` 合成并写回（详见 §9） |
| `retrieve_academic` | 读 | `@hca/medical-kb` 学术检索（对齐 Agent I-AGT-007；MCP2-04，Sprint 2，ADR-012） |
| `retrieve_compliance` | 读 | `@hca/medical-kb` 合规检索（对齐 Agent I-AGT-008；`tenant_id` 不作入参：租户鉴权上线前仅返回全局种子，上线后来自服务端上下文，MCP2-05，Sprint 2，ADR-012） |
| `ingest_academic` | 写（知识面幂等，ADR-014） | `@hca/medical-kb` `ingestOnDemand`（coverage 门控幂等；受控键归一化；MCP2-08，详见 §14） |
| `get_ingest_status` | 读 | `@hca/medical-kb` `getIngestStatus`（按 `job_id` 或 `specialty`；MCP2-08，详见 §14） |

## 4. 错误与观测

- 统一 `{ code, message, repair_hint? }`；与 BFF 错误码对齐。
- 健康：可选 `health` tool 或独立 HTTP `/health`（Streamable HTTP 时）。
- 指标（后续）：每 tool 延迟、LLM 调用次数、失败码计数。

## 5. 实现顺序

见 [sprint-backlog.md](../sprint-backlog.md) Sprint 1–3。

随 ADR-008 纳入 Sprint 1：移除 stdio 分支（`startStdio`、`MCP2_TRANSPORT` 读取）、`.env.example` 清理 `MCP2_TRANSPORT`、`.cursor/mcp.json` 改 `url` 接入。该批次已在 task-01 落地。

## 6. feature-01 `query_hcp` 技术设计

风格：直接读库。不调用模型，不走对内 `hcp-twin-mcp`。

```text
MCP Client
    │ query_hcp
    ▼
handler（packages/hcp-engagement-mcp）
    │ 校验：hcp_id 或 name 至少其一
    ▼
@hca/db queryTwins
    │
    ▼
MySQL hcp_twins（排除 _agent_general）
```

| 规则 | 行为 |
| --- | --- |
| 有 `hcp_id` | 只查该编号。不存在或为 `_agent_general` 时返回 `NOT_FOUND`。编号存在时，`hospital` / `department` / `city` 对不上则 `{ count: 0, items: [] }` |
| 仅 `name` | 在已保存医生中过滤。中文名精确。拉丁名见下方「姓名比对」。医院、科室见「可选过滤」 |
| 可选过滤（[ADR-011](../../docs/adr/ADR-011-hospital-department-substring-match.md)） | `hospital` / `department` 两档匹配：档 0 归一相等（去空格、转小写）；档 1 归一后一方为另一方子串，短边最短长度医院 3 字符、科室 2 字符。`city` 仍归一相等 |
| 返回 | `{ count, items }`。`items[]` 为完整 `VirtualTwin`。精确命中在前，词序互换次之，编辑距离最后；同一档保持查出顺序。若 twin 上已有构建 run id，可放在该项的 `build.runId` |
| 两者都缺 | `VALIDATION_ERROR`（task-01 已有） |
| 库异常 | `INTERNAL_ERROR`，无堆栈、无连接串 |

### 姓名比对

比对在 `@hca/db` 的 `nameMatchTier` 内完成，进程内过滤，不把拼音或编辑距离写进 SQL。不调用模型。规则是固定字符串比较。

拉丁查询按下面顺序归一。中文名不走这五步。

1. 去掉首尾空格。
2. 反复去掉行首称谓 `dr`、`prof`、`md`。大小写不限。称谓后可有一个句点，然后至少一个空格。行首不再是这三个词就停止。
3. 半角逗号 `,` 与全角逗号 `，` 换成空格。
4. 去掉连字符 `-`、直撇号 `'`、弯撇号 `'`（U+2019）。
5. 转小写。精确比对再去掉中间空格。拼音为 `name_zh` 的无声调拼音（`pinyin-pro`），再做同一空格归一。

| 步骤 | 规则 |
| --- | --- |
| 中文 | `name` 与 `name_zh` 全等才命中。中文错字、同音字不命中 |
| 精确拉丁 | 归一后的 `name` 等于归一后的 `name_en`，或等于归一后的拼音。连字符或撇号去掉后相等，仍是这一档。例：`Wen-hong Zhang` 对 `Wenhong Zhang` |
| 词序互换 | 归一后按空格拆成至少两段时，倒序再拼接，做同一精确比对。逗号已换成空格，所以 `zhang, wenhong` 与 `wenhong zhang` 同一档。`changxi wang` 与 `wangchangxi` 仍视为同一串 |
| 编辑距离 | 只对拉丁全串。查询串与倒序串分别去空格后，与 `name_en` 或拼音比较。两边长度都至少为 6，且编辑距离小于等于 1，才命中。短于 6 的查询不做这一步。距离大于等于 2 不命中。例：`zhang, wenhon` 倒序后与 `Wenhong Zhang` 相差 1 |
| 排序 | 中文或拉丁精确，然后词序互换精确，然后编辑距离。同一档保持查出顺序。精确与词序互换优先于编辑距离 |

不做：

- 句点缩写。`Y. Han` 不匹配 `Yaling Han`。句点不删除，也不当事分隔符。
- 行尾或行中称谓。`Yaling Han, MD` 不因称谓规则去掉 `MD`。
- 称谓与姓名之间没有空格。`Dr.Yaling` 不去掉称谓。
- 多音字的第二读音。中间名忽略。医院、科室、城市的模糊。SQL `LIKE`。

`query_hcp` 的 `name` 说明改为：`HCP 姓名：中文精确；英文/拼音；名在前或「姓, 名」；连字符与撇号忽略；行首 Dr/Prof/MD 忽略；长度不少于 6 的拉丁全名允许 1 次拼写差异（含倒序之后）`。返回仍是 `{ count, items }`。无命中是 `count` 为 0，工具结果为成功。

实现落点：

- 查询函数放在 `packages/db/src/twins.ts` 并导出。MCP handler 只做校验与 `mcpError` 映射，不复制姓名规则。
- 拼音用依赖 `pinyin-pro`，只在 `@hca/db` 内把中文名转成无声调拼音再比对。无新依赖、无新表、无迁移。
- 姓名规则以本节为准。[db-design.md](../db/db-design.md) 只写 MySQL 客户端，不重写本节。
- `list_hcp` 与 `add_hcp` 保持 stub，不在本故事改。

环境：进程需要 `DATABASE_URL`（与 Web 同一 MySQL）。无新表、无迁移。

**DEF-001**：`@hca/db` 运行时已改 `mysql2`（见 [db-design.md](../db/db-design.md)）。issue 仍 Open，关闭不在本规格内。模糊姓名在该客户端之上改 `nameMatches`。

### §6 增补（OGT-1）：`include_external` 库外候选检索（ADR-010）

`query_hcp` 增可选参数 `include_external`（默认 `false`）。开启后在库内结果之外同步检索库外公开源，把 resolve 的「找人」能力并入 `query_hcp`，不单设 search 工具。

| 规则 | 行为 |
| --- | --- |
| 触发与默认 | `include_external: true` 才触发；默认 `false`，快路径只查库，不访问公开源。发起库外检索须同时传 `hospital` 与 `department`（对内 resolve 必填），缺一时不调 resolve，`external.count` 为 0 并附提示，仍非错误 |
| 外部源 | 复用已有 `@hca/mcp-client`，经 `MCP_URL` 调对内 `hcp-twin-mcp` 的 `resolve_hcp_identity`（HTTP）。不新写 collector，不在本包内直连 ORCID / PubMed / OpenAlex |
| 返回形状 | 库内照旧 `{ count, items }`；同层新增 `external: { count, items[] }`。候选项含 `candidate_id`、姓名、医院、科室、来源 ID（公开源标识，如 ORCID / PubMed / OpenAlex）与来源名 |
| 令牌签发 | 每个候选项签发 `candidate_id`（进程内 LRU，TTL 默认 30 分钟；键含身份串 + 作者 ID + 派生 `hcp_id`，作者 ID 落主 ID 与 `openalex_aliases`，ADR-004）。候选 payload 与令牌一起缓存；重启丢失属预期，重调 `query_hcp` 即可重建 |
| 同人去重 | 库内已命中的医生不再出现在 `external.items`（以 `hcp_id` 及 ADR-009 同款姓名规则判定同人） |
| 人选认 | `add_hcp` 只接受经人选认的 `candidate_id`；宿主 agent 负责把人的选择（如「第二个」）映射为 `candidate_id`，再作写入入参（见 §8 令牌门） |
| 降级 | 对内 MCP 不在线或 resolve 失败：库内结果照常返回，`external.count` 为 0 并附降级提示，不按错误返回 |
| Annotations | `openWorldHint: true`（开启时会访问公开源）；`readOnlyHint: true` 不变 |

实现落点：

- resolve 调用封装为 `ResolveIdentityFn` 注入项（与 `queryTwins` / `listTwins` 同模式），handler 只组参、映射错误与降级。
- 令牌缓存为进程内模块（含签发、按 `candidate_id` 换取 payload、作废三操作）；单实例部署（ADR-010），多实例 Redis 留待后续。

## 7. feature-02 `list_hcp` 技术设计

风格与 feature-01 一致：直接读库，不调用模型，不走对内 `hcp-twin-mcp`。

```text
MCP Client
    │ list_hcp
    ▼
handler（packages/hcp-engagement-mcp）
    │ 无入参校验（工具无参数）
    ▼
@hca/db listTwins
    │
    ▼
MySQL hcp_twins（排除 _agent_general）
```

| 规则 | 行为 |
| --- | --- |
| 入参 | 无必填、无可选参数。2.0 **不提供** `limit` / `offset` 分页（与 product-backlog 契约一致；将来列表过大时另立故事） |
| 返回 | `{ count, items }`。`count` 为已保存医生总数，`items[]` 与 `count` 等长。每条为 `TwinListItem` 摘要字段（`hcp_id`、`name_zh`、`hospital`、`department`、`as_of`、`twin_version`、`tags`、`doing_now` 摘要），**不是**完整 `VirtualTwin` |
| 排除占位 | `_agent_general` 由 `listTwins` 内部排除（现有实现已满足），handler 不重复过滤 |
| 排序 | 保持 `listTwins` 现有查出顺序；本故事不引入排序参数或新排序规则 |
| 空库 | 正常成功结果 `{ count: 0, items: [] }`，不是错误 |
| 库异常 | `INTERNAL_ERROR`，经 `mcpError` 映射，无堆栈、无连接串 |
| Annotations | `readOnlyHint: true`、`openWorldHint: false`；handler 只读不写库 |

实现落点：
- 查询函数复用 `packages/db/src/twins.ts` 的 `listTwins` 并导出注入（与 feature-01 的 `queryTwins` 注入方式一致，便于测试替换）。MCP handler 只做调用与 `mcpError` 映射，不复制查询逻辑。
- 无新依赖、无新表、无迁移。环境仍只需 `DATABASE_URL`（与 Web 同一 MySQL）。
- `add_hcp` 保持 stub，不在本故事改。

## 8. feature-03 `add_hcp` 技术设计

风格与 feature-01/02 一致：不调用模型，不走对内 `hcp-twin-mcp` 的 build / collectors；身份入参不再由调用方直传，而是来自 `query_hcp` 库外签发的候选令牌（ADR-010）。与 [architecture.md §5.4](../architecture.md) 的决策一致：身份构造与写库收敛为 `@hca/db` 共享服务，MCP handler 只查令牌、组入参、映射错误。

```text
MCP Client
    │ add_hcp
    ▼
handler（packages/hcp-engagement-mcp）
    │ 令牌门：candidate_id 查进程内 TTL 缓存（ADR-010），换取身份入参
    ▼
@hca/db confirmAndSaveTwin（packages/db/src/confirm.ts，本故事新建）
    │ getTwin 查重 → 姓名档位查重（query_hcp 同规则）→ 构造 identity twin → upsertTwin + upsertInsights（空模板）
    ▼
MySQL hcp_twins + hcp_insights
```

| 规则 | 行为 |
| --- | --- |
| 入参 | `candidate_id` 必填（来自 `query_hcp` 库外检出、经人选认的候选）；`confirm_not_duplicate` 可选（boolean）。缺 `candidate_id` → `VALIDATION_ERROR` |
| 令牌门（ADR-010） | 令牌不存在 / 过期 / 已用 → `NOT_FOUND`，`repair_hint` 指明重新 `query_hcp` 获取候选、经人选认后重试。身份入参（`hcp_id`、姓名、医院、科室等）由缓存中的候选载荷生成。写入成功即作废令牌，防二次新增 |
| 编号已存在 | `VALIDATION_ERROR`，**不覆盖**已有 Twin（更新走 Web 编辑或 TWIN2-01）。写库前先 `getTwin` 查重，命中即拒绝且不写库 |
| 占位编号 | `hcp_id` 为 `_agent_general` → `VALIDATION_ERROR`，不可作为新增。候选派生 `hcp_id` 理论上不落占位值，该防线保留为服务层防御 |
| 同名疑似同人（ADR-009） | 写库前按 `query_hcp` 同款姓名规则查重：`name_zh` 走中文精确、`name_en`（候选携带时）走拉丁档位，姓名串取自候选载荷，分别查找，编号不同的姓名命中即疑似。疑似时不写库，返回 `confirmation_required` 与 `possible_duplicates[]`（每条含 `hcp_id`、姓名、医院、科室、`match_tier`；医院/科室归一相同者排前，其余按档位序；多条全量列出，上限 20 条，超出截断并附 `truncated: true`，调用方可再调 `query_hcp` 查看全部）。`repair_hint` 指明两条出路：判定为已有医生时直接用其 `hcp_id`、不再调 `add_hcp`；确认非重复时带 `confirm_not_duplicate: true` 重调写入 |
| 确认绕过 | `confirm_not_duplicate: true` 跳过同名查重直接写入；`hcp_id` 精确查重不受该参数影响，仍拒绝覆盖 |
| identity twin 构造 | `twin_version: 1`、`as_of` 为当天、`build_mode: "full"`、`disambiguation_status: "ambiguous"`（与对内 confirm 行为一致：A9 仅约束 `resolved`，无消歧仍可落身份）。构造逻辑在 `@hca/db` 共享服务内实现，handler 不复制 |
| 标签 | 候选不携带标签草稿：`hcp_tier` 缺省 `T2`（枚举 `T1/T2/T3/unclassified`，同 `@hca/domain HcpTierSchema`）；`role_tags` 缺省空数组。恒定 `tag_confidence: "low"`、`tag_method: "rule"`、`tag_as_of` 为当天、`evidence_refs: ["confirm_identity"]` |
| 专长与主题 | 候选不携带专长与主题；`profile.specialties` / `research.themes` 落缺省空数组 |
| 候选载荷 | 文献号搬自候选载荷，落库与 Web「确认并保存」同校验（ADR-004）：主 ID 取 `openalex`，`openalex_aliases` 去重且不含主 ID；写入 `research.author_ids` 与镜像 `profile.external_ids`。task-01 stub 的入参 `author_ids_draft` / `tags_draft`（`string[]`）废弃：feature-03 实现时 schema 改为 `candidate_id` 必填 + `confirm_not_duplicate` 可选，`description` 同步更新 |
| Insight 写入 | 与 Web confirm 行为一致：写空模板（`interest_directions: []`、`opportunities: []`、无 `doing_now`）。`get_hcp_insights` 在 Sprint 2 依此不 404 |
| 返回 | 写入成功为 `{ twin, hcp_id }`（成功分支形状不变）；疑似同人为 `{ status: "confirmation_required", possible_duplicates: [...] }`。`knowledge_jobs` MVP **不联动**学术 ingest（architecture §12 开放问题），本故事不出现该键 |
| 库异常 | `INTERNAL_ERROR`，经 `mcpError` 映射，无堆栈、无连接串 |
| Annotations | `readOnlyHint: false`、`openWorldHint: false`；工具为写库、非删除、非幂等（重复同编号被查重拒绝） |

实现落点：

- 共享服务新建 `packages/db/src/confirm.ts`，导出 `confirmAndSaveTwin(input)`，返回 union：`{ twin, hcpId }`（写入成功）或 `{ status: "confirmation_required", possibleDuplicates: { hcp_id, name_zh, hospital, department, match_tier }[] }`（未写库），并在 `@hca/db` 入口导出（architecture §5.4 重构步骤 1）。服务不依赖 `@hca/hcp-twin-mcp`；身份构造逻辑在本服务内实现，等价于对内 `buildIdentityTwin` 的行为，不复制 resolve / collector。
- 同名查重复用 `queryTwins({ name })`：`name_zh`、`name_en`（若传）各查一次，行为与 `query_hcp` 完全一致；命中档位通过在 `queryTwins` 返回项上附 `name_match_tier` 字段获得（只增字段，向后兼容，不改变现有返回形状）。
- MCP handler 以 `candidate_id` 查进程内令牌缓存（签发在 `query_hcp` 库外检索，见 §6 增补）：查不到 / 过期 / 已用 → `NOT_FOUND`；命中则由候选载荷组装 `confirmAndSaveTwin` 入参（文献号按 ADR-004 落主 ID + `openalex_aliases` 并镜像），写入成功后作废令牌。`AddHcpFn` 注入项与 `queryTwins` / `listTwins` 同模式，方便契约测试注入。
- Web BFF 路由（另一仓库）迁移到同一共享服务不在本故事；另开任务。
- 无新依赖、无新表、无迁移。环境需要 `DATABASE_URL`（与 Web 同一 MySQL）；`MCP_URL` 属 §6 增补的 `query_hcp` 检索链路，add_hcp 本身不访问公开源。

### §8 增补（ADR-013）：`add_hcp` 异步触发刷新

| 规则 | 行为 |
| --- | --- |
| 触发时机 | `confirmAndSaveTwin` 写库成功（`{ twin, hcpId }` 分支）后，异步（不阻塞返回、不 await）对新建 `hcp_id` 起一次 build。疑似同人确认分支（`confirmation_required`）不触发 |
| 返回 | 成功分支返回体增加 `refresh: { run_id }`；`run_id` 来自触发的构建 run。build 入队失败不回滚写入、不影响成功返回，只记 stderr 结构化日志 |
| 进度查询 | 调用方用既有对内 `get_twin_status`（经 BFF 代理）按 `run_id` 查询；本工具不新增进度查询入口 |
| 落点 | 触发点在 MCP handler 层（拿到写入成功结果后 fire-and-forget 调用对内 build 入口）；`confirmAndSaveTwin` 共享服务保持纯写库，Web BFF 复用不受影响 |

## 9. feature-01 `get_hcp_insights` 技术设计（Sprint 2，ADR-013）

读为主、按需幂等回填：insights 已有 `doing_now` 时纯读；空模板且 Twin 事实足够时，服务器内经 `ensureDoingNow` 合成一次并写回缓存。

```text
MCP Client
   │ get_hcp_insights
   ▼
handler（packages/hcp-engagement-mcp）
   │ getTwin 预检（@hca/db）：编号不存在或为 _agent_general → NOT_FOUND
   │ getInsights（@hca/db）
   ├─ doing_now.summary 非空 → 直接返回（纯读路径，不调 LLM、不写库）
   └─ 空模板 → ensureDoingNow(hcpId)（已落地于 @hca/hcp-engagement-agent）
        ├─ ready → 写回 hcp_insights 缓存，重取 getInsights 返回，insights 顶层 synthesized: true
        ├─ 同 hcp_id 进行中 → 进程内 in-flight 去重，复用同一次合成
        └─ pending（事实不足 / 无 Key / LLM 失败）→ 返回空模板，insights 顶层 pending: true + repair_hint，不报 INTERNAL_ERROR
```

| 规则 | 行为 |
| --- | --- |
| 入参 | `hcp_id` 必填；`getTwin` 预检：编号不存在或为 `_agent_general` → `NOT_FOUND`（与 `query_hcp` 口径一致） |
| 处理流 | ① `getTwin` 预检 → ② `getInsights`：`doing_now.summary` 非空走纯读 → ③ 空模板时调注入的 `EnsureDoingNowFn`：`ready` 重取 `getInsights`（含写回结果）组装返回；`pending` 返回空模板 insights，不抛错 |
| 纯读路径 | `insights.doing_now` 已存在：不调 LLM、不写库，行为与纯读一致 |
| 按需合成 | `doing_now` 为空且 Twin 事实（专长、主题、标签等）足够时调用 `ensureDoingNow`；同一 HCP 已有进行中的 run 时复用该 run（去重），不并发起第二个任务 |
| 事实不足 | Twin 无足够事实（如身份 twin 刚建、无专长与主题）：不调 LLM，返回空模板 + `pending: true`，`repair_hint` 指明等待 TWIN2-01 刷新或 Web 编辑补充 |
| 降级 | LLM 失败、超时、无 Key：返回空模板 + `pending: true`；错误记结构化日志，不映射 `INTERNAL_ERROR` |
| 写回 | 合成结果写 `hcp_insights`（幂等缓存回填，ADR-013）；失败时不写，下次调用重试 |
| 返回 | `{ twin, insights }`；`synthesized: true`（合成成功）与 `pending: true`（事实不足 / 无 Key / LLM 失败）互斥，均在 `insights` 顶层；`repair_hint` 仅 pending 时出现，指明等待 TWIN2-01 刷新或 Web 编辑补充 |
| Annotations | `readOnlyHint: false`（幂等缓存回填，ADR-012 修订见 ADR-013）、`openWorldHint: false` |

实现落点：

- `ensureDoingNow(hcpId)` 已随 feature-05 落地于 `packages/hcp-engagement-agent/src/ensure-doing-now.ts` 并从包入口导出，返回 `ready { doing_now, reused }` 或 `pending { reason: twin_missing | insufficient_facts | llm_unavailable }`；三个触发源（build 完成、TWIN2-01 定时、本工具按需）已收敛到该入口。本故事只做 MCP 工具接线。
- `@hca/hcp-engagement-mcp` 新增 workspace 依赖 `@hca/hcp-engagement-agent`；无其他新依赖、无新表、无迁移。
- handler 对 `EnsureDoingNowFn` 与 `getInsights` / `getTwin` 采用注入，同 §7 模式，便于契约测试注入假实现；并发去重由 `ensureDoingNow` 进程内 in-flight 表承担（已实现），handler 不重复实现。
- 环境需要 `DATABASE_URL` 与 LLM Key（与 Web 合成同一配置）；Key 缺失走降级路径，不算配置错误。

## 10. feature-02 `retrieve_academic` 技术设计（Sprint 2，ADR-012）

纯读数据面工具：按 HCP 与条件检索 medical-kb 学术证据，返回带引用的 chunk；不生成方案、不写库。

```text
MCP Client
   │ retrieve_academic
   ▼
handler（packages/hcp-engagement-mcp）
   │ getTwin 预检（@hca/db）：编号不存在或为 _agent_general → NOT_FOUND
   │ query 组装：调用方传 query 用之；否则 research.themes 前 3 拼接，
   │   退「{姓名} 学术交流」（同 propose.ts 既有先例）
   │ specialty 组装：调用方传 specialty 用之；否则 twin.profile.specialties[0]
   ▼
RetrieveAcademicFn（缺省 retrieveAcademicForAgent，@hca/hcp-engagement-agent）
   │ themes / language / top_k 走底层默认；不暴露 year_from / top_k 入参
   ▼
{ chunks: RagChunk[] } 原样返回
```

| 规则 | 行为 |
| --- | --- |
| 入参 | `hcp_id` 必填；`query`、`specialty`、`themes` 可选（对齐 I-AGT-007 与 [product-backlog](../product-backlog.md#pb-4)）；`getTwin` 预检同 §9 口径 |
| query 组装 | 只传 `hcp_id` 时由 twin 派生检索词（themes 优先、姓名学术交流兜底），保证无 query 也可检索；组装结果为空 → `VALIDATION_ERROR` |
| 过滤透传 | 调用方传的 `query` / `specialty` / `themes` 原样透传底层检索 |
| 返回 | `{ chunks }`，每条 `RagChunk` 含引用字段：`source`、`source_url`、`doi`、`pmid`、`year`、`specialty`、`version`、`as_of`、`score`；不含方案生成结果。**扩展（[ADR-014](../../docs/adr/ADR-014-retrieve-coverage-signal-and-academic-ingest.md)，feature-07 实施批次落地）**：返回体增加 `coverage`（复用 `coverageCheck` 的 `status` 与专科 chunk 数）；`sparse` 时附 `repair_hint` 建议补种后重试；不内联补种、不阻塞 |
| 失败 | twin 预检失败 → `NOT_FOUND`；缺 `hcp_id` → SDK schema 层拦截；底层 RAG 不可用（Qdrant / 嵌入失败）→ `INTERNAL_ERROR`，`repair_hint` 指向 Qdrant 连通性；错误信封无 `stack`、无连接串 |
| Annotations | `readOnlyHint: true`（纯读）、`openWorldHint: true`（公开文献库） |

实现落点：

- `retrieveAcademicForAgent(raw)` 已落地于 `@hca/hcp-engagement-agent/src/retrieve.ts` 并从包入口导出，内部经 `@hca/medical-kb` `retrieveAcademic`（向量 + BM25 + RRF + rerank）；本故事只做 MCP 接线。
- 依赖不变：`@hca/hcp-engagement-mcp` 已依赖 `@hca/hcp-engagement-agent`（feature-01 接入）；无新依赖、无迁移。
- handler 注入 `GetTwinFn`（复用 §9 定义）与 `RetrieveAcademicFn`；检索与排序逻辑全部留在 medical-kb，handler 不复制。
- 环境：`DATABASE_URL`（twin 预检）+ Qdrant 与嵌入配置（`VECTOR_BACKEND=qdrant-local`、`QDRANT_URL`、`EMBEDDING_MODEL`、`RERANK_MODEL`，与 medical-kb 现有口径一致）。

## 11. feature-04 `retrieve_compliance` 技术设计（Sprint 2，ADR-012）

纯读数据面工具：检索合规知识库条款引用，返回带条款元数据的 chunk；工具 description 写明不是预审判定、不替代正式 MLR。`tenant_id` 不作入参（ADR-012）。

```text
MCP Client
   │ retrieve_compliance
   ▼
handler（packages/hcp-engagement-mcp）
   │ getTwin 预检：编号不存在或为 _agent_general → NOT_FOUND
   │ query 组装：调用方传 query 用之；否则默认合规检索词
   │   「医药代表 学术推广 机构同意 备案 科室会 RDPAC 合规」（同 propose.ts）
   │ jurisdiction 服务端固定 CN，不作入参
   │ tenant_id 不入参、不透传 → 底层仅返回全局种子（tid 为空的过滤已实现）
   ▼
RetrieveComplianceFn（缺省 retrieveComplianceForAgent，@hca/hcp-engagement-agent）
   │ interaction_type 透传；top_k 走底层默认
   │ 底层 medical-kb retrieveCompliance 返回 { chunks, coverage?, repair_hint? }（MKB2-03 增补）：
   │   coverage 经 complianceCoverage()：以 ingest_manifest 为权威
   │   列出各 authority（version / chunk_count / 最新 as_of），status: ready | sparse
   ▼
{ chunks, coverage?, repair_hint? } 原样返回
   coverage.status 为 sparse → 返回体附 repair_hint，建议运维 seed_compliance 后重试
```

MKB2-03 增补的透传规则同 §12 学术侧（ADR-014）：底层降级省略 `coverage` 时返回体无该键、检索不报错；handler 不二次查询、不内联补种。

| 规则 | 行为 |
| --- | --- |
| 入参 | `hcp_id` 必填；`query`、`interaction_type` 可选（对齐 I-AGT-008 与 [product-backlog](../product-backlog.md#pb-5)）；schema properties 不含 `tenant_id` 键、不含 `jurisdiction` 键 |
| tenant 边界 | `tenant_id` 不入参、handler 不透传；底层 `tenant_id` 缺省时过滤 `tid == null`，只返回全局种子（租户鉴权上线后改由服务端上下文注入，见 ADR-012） |
| query 组装 | 只传 `hcp_id` 时用默认合规检索词，保证无 query 也可检索 |
| description | 声明本工具只返回条款引用，不是预审判定、不替代正式 MLR |
| 返回 | `{ chunks, coverage?, repair_hint? }`，每条 `RagChunk` 含 `clause_id`、`authority`、`version`、`jurisdiction`、`source`、`as_of`、`score`。MKB2-03 增补（feature-04 接线时生效，与 [rag-design §19](../rag/rag-design.md) 同批验收）：`coverage` 为 `{ authorities: [{ authority, version, chunk_count, as_of }], status: ready \| sparse }`，medical-kb `complianceCoverage()` 以 `ingest_manifest` 为权威；`sparse`（manifest 无任何 authority 行）附 `repair_hint` 建议运维 `seed_compliance` 灌种后重试；manifest 读取失败时底层降级省略 `coverage` 键、检索不报错（同 ADR-014 学术侧语义：只读旁路、handler 不二次查询、不内联补种） |
| 失败 | twin 预检失败 → `NOT_FOUND`；缺 `hcp_id` → SDK schema 层拦截；底层 RAG 不可用 → `INTERNAL_ERROR`，`repair_hint` 指向 Qdrant 连通性；错误信封无 `stack`、无连接串 |
| Annotations | `readOnlyHint: true`（纯读）、`openWorldHint: false`（内部知识库种子） |

实现落点：

- `retrieveComplianceForAgent(raw)` 已落地并从包入口导出，内部经 `@hca/medical-kb` `retrieveCompliance`；本故事只做 MCP 接线。
- handler 注入 `GetTwinFn`（复用）与 `RetrieveComplianceFn`；注入与契约测试模式同 §10，feature-02 先行落地后本故事大部分为机械复制。
- 环境：同 §10 的 Qdrant 与嵌入配置；合规种子须已灌库（`seedCompliance` 既有流程）。
- 与 feature-02 的分界：两个工具各自注册、各自验收（MCP2-04 / MCP2-05 两个父 PBI）；共享的只有注入模式与测试脚手架。

## 12. feature-07 知识覆盖对齐技术设计（Sprint 2，ADR-014）

MCP 调用方与 Web 获得同等的知识库覆盖：`add_hcp` 写库成功后按 Twin 专科 fire-and-forget 预灌（与 Web confirm 的 `triggerKnowledgeIngest` 同语义）；`retrieve_academic` 返回体增加 `coverage` 信号，低命中建议补种。

```text
MCP Client
   │ add_hcp（写库成功后）
   ▼
handler（packages/hcp-engagement-mcp）
   │ 写库 + 异步 build（既有，ADR-013，不动）
   │ fire-and-forget TriggerIngestFn（注入项，缺省 defaultTriggerKnowledgeIngest）：
   │   resolveSpecialtiesForIngest(twin: specialties / research.themes / department / tags_draft)
   │   → 逐受控专科 ingestOnDemand（coverage 门控幂等；INGEST_IN_PROGRESS 记 pending）
   ▼
返回体可选附 knowledge_jobs[]（{ specialty, job_id, knowledge_status }）
   预灌失败只记结构化日志，不进错误信封、不阻塞返回

MCP Client
   │ retrieve_academic
   ▼
RetrieveAcademicFn（缺省 retrieveAcademicForAgent）
   │ 底层 medical-kb retrieveAcademic 返回 { chunks, coverage? }：
   │   coverage 内部经 coverageCheck(specialty)：{ status: ready | sparse, chunk_count }
   │   归一化出受控专科 → 带 coverage；无专科口径 → 省略字段
   ▼
{ chunks, coverage? } 原样返回
   coverage.status 为 sparse → 返回体附 repair_hint 建议补种后重试
   （ingest_academic 工具由 feature-08 / MCP2-08 提供；未上线前建议语写「知识库覆盖不足，补种后重试」）
```

| 规则 | 行为 |
| --- | --- |
| add_hcp 预灌 | 写库成功后 fire-and-forget；`TriggerIngestFn` 注入（缺省 `defaultTriggerKnowledgeIngest`）；失败只记日志、不进错误信封、不影响写入成功 |
| 专科解析 | 与 Web confirm 完全同源：twin `profile.specialties` / `research.themes` / `department` / `tags_draft` → `resolveSpecialtiesForIngest`（受控键；非受控静默跳过，不报错） |
| coverage 来源 | 底层 `retrieveAcademic` 返回体附 `coverage`（同一次调用内 `coverageCheck`），handler 不二次查询；`coverage` 权威以 job / manifest 为准（F-RAG-017，不写 Twin 文档） |
| coverage 省略 | 无法归一化出受控专科时省略 `coverage` 字段，检索照常返回、不报错 |
| sparse 建议 | `coverage.status: "sparse"` 时返回体附 `repair_hint`；检索本身不触发灌注、不写库（ADR-014 决策 1） |
| Annotations | 两工具注解不变（`retrieve_academic` 保持 `readOnlyHint: true`；`add_hcp` 保持既有写注解） |

实现落点：

- `triggerKnowledgeIngest` / `resolveSpecialtiesForIngest` 从 `apps/web/src/lib/rag-ingest.ts` 提取到 `@hca/medical-kb` 并导出；webapp 改为从包导入，行为不变（回归验证）。Web 的 department 正则启发式（肾移植 / 噬菌体 / 遗传）随函数一并入包。
- `@hca/medical-kb` `retrieveAcademic` 返回签名扩为 `{ chunks, coverage? }`；`@hca/hcp-engagement-agent` `retrieveAcademicForAgent` 透传，coverage 类型从 agent 包入口再导出（同 `RagChunk` 先例）。
- mcp 包 `CreateMcpServerOptions` 增 `triggerIngest` 注入项；`RetrieveAcademicFn` 返回签名同步扩展。
- 依赖不变：mcp 包仍只依赖 `@hca/hcp-engagement-agent`；medical-kb 新导出经 agent 包再导出，无新包依赖、无迁移。
- 环境：同 §10；预灌走 `ingestOnDemand` 既有链路（Qdrant + PubMed / OpenAlex 可达时拉公开源，否则 fixture 路径）。
- 与 feature-08 的分界：本故事只做预灌触发与信号透出；`ingest_academic` / `get_ingest_status` 两个新工具注册归 MCP2-08。feature-07 先交付时 sparse 建议语不点名工具，feature-08 落地后建议语升级为工具名。

## 13. feature-11 科室来源标注与预灌映射预览技术设计（MCP2-09，DEF-005）

> 故事：[US-MCP2-007](./mcp2-stories.md) · 测试：[mcp2-test §14](./mcp2-test.md) · 需求：[pb-14](../product-backlog.md#pb-14) · 对内契约：[mcp-design · MCP2-09 节](../mcp/mcp-design.md)

### 13.1 动因与范围

- DEF-005：`resolve_hcp_identity` 把调用方提示科室当已核实身份回显，确认页以 high confidence 展示；陆林「神经科」错标预灌 neurology（应为 psychiatry）、王拥军「神经病」截断，两次实际发生。
- 本节三件事：外部候选透传科室来源标注；`add_hcp` 确认返回「科室 → 将预灌专科」映射预览；映射不到受控专科时的可见提示。
- 范围外（pb-14）：不自动纠正科室（OpenAlex 无可靠中文科室字段）；不新增对外工具。**13.6 增补（MCP2-10 / DEF-006）后**：入库科室规则与 mismatch 闸门以 13.6 为准；来源标注、信号对照与映射预览（13.2–13.3）继续有效。

### 13.2 query_hcp 候选透传

- `query_hcp`（`include_external: true`）的外部候选逐字段透传 twin-mcp resolve 新字段：`department_provenance`、`department_signal`、`department_mismatch`（字段语义见 [mcp-design · MCP2-09 节](../mcp/mcp-design.md)）。
- candidate-store 缓存一并保存新字段，供 `add_hcp` 确认时回看；令牌有效期与既有口径一致（ADR-010）。

### 13.3 add_hcp 映射预览

- `add_hcp` 确认返回体新增 `specialty_preview[]`，每行 `{ input, specialty, matched }`：
  - `input`：入参科室原文（或候选缓存中的科室）。**13.6 增补后**：department 行的 `input` 改为入库科室（信号专科的标准中文名，见 §13.6「预灌一致」），不再取调用方输入原文；非科室行（专长等）口径不变。
  - `specialty`：`resolveSpecialtiesForIngest` 归一化出的受控专科键；`matched: false` 表示映射不到任何受控专科。
- 预览与实际预灌同源：预览是 `resolveSpecialtiesForIngest` 同一次调用结果的明细视图，不另起一套映射，保证「预览与实际预灌专科一致」（与 §12 预灌链路共用，无第二份归一化）。
- `matched: false` 的行附跳过提示（预灌将跳过该科室）；预灌静默跳过行为本身不变，但返回体可见。13.6 后 department 行恒 `matched: true`（入库科室本身就是受控专科中文名）。
- 既有口径不变：预灌失败不影响 `add_hcp` 成功返回（§12）。

### 13.4 数据流

```text
调用方输入科室
  → twin-mcp resolve（来源标注 + OpenAlex 主题/机构信号对照，mismatch 判定）
  → query_hcp include_external 候选透传（provenance / signal / mismatch）
  → add_hcp 确认（resolveSpecialtiesForIngest 明细 → specialty_preview + knowledge_jobs）
  → Web 确认页展示（US-WEB-004 / F-WEB-047）
```

### 13.5 实现落点

- `packages/hcp-engagement-mcp`：`ResolveCandidateInput` 与 `CandidatePayload` 扩展三新字段；`add_hcp` 返回体拼装 `specialty_preview`（复用 §12 已提取的 `resolveSpecialtiesForIngest`，medical-kb 导出）。
- 归一化（输入科室正则、OpenAlex 主题归一化）主权在 `@hca/medical-kb`，与 §12 同源；OpenAlex 主题归一化按 [mcp-design · MCP2-09 节](../mcp/mcp-design.md) 落 twin-mcp 侧导入。
- 依赖不变：mcp 包仍只依赖 `@hca/hcp-engagement-agent` / `@hca/medical-kb` 既有导出，无新包依赖、无迁移。
- **2026-10-21 增补（B+ 设计）**：信号补全落 twin-mcp resolve live 路径（作者级主题词推不出受控专科键时懒拉论文级概念，机制见 [mcp-design · MCP2-09 节](../mcp/mcp-design.md)）；`query_hcp` 文本卡片列出主题词与「科室判断」（公开数据指向的科室、与输入是否一致、不一致时候选问句「是否按 X 入库」），完整字段仍在 structuredContent。`add_hcp` 闸门不动：信号补全只是让 MCP2-10 的 mismatch / 无信号分支有据可依。

### 13.6 入库科室以选中记录信号专科为准（MCP2-10 / DEF-006，D2）

> 故事：[US-MCP2-007 增补](./mcp2-stories.md) · 测试：[mcp2-test §15](./mcp2-test.md) · 需求：[pb-16](../product-backlog.md#pb-16) · 缺陷：[DEF-006](../issues-log.md)

#### 动因与方向

- DEF-006：feature-11 修复后 live 复验，侯凡凡输入「神内科」，`specialty_preview` 如实报 `matched: false`，但 `add_hcp` 仍原样保存「神经内科」语义之外的「神内科」；系统既未阻断也未采用数据源信号。
- 方向（2026-10-21 用户定，D2）：入库科室以选中候选的数据源信号专科为准；信号与输入不一致时人工确认才放行；无信号时阻断保存；确认页科室不可编辑。

#### 入库科室规则

| 规则 | 行为 |
| --- | --- |
| 入库科室来源 | `add_hcp` 写库的 `twin.identity.department` 取候选 `department_signal.specialty` 映射的受控专科标准中文名（`@hca/medical-kb` 提供 `specialtyDisplayName` 反查：如 `psychiatry → 精神科`、`nephrology → 肾内科`）；不再取候选载荷 `department`（调用方输入原文） |
| 预灌一致 | `specialty_preview` 的 department 行以入库科室（信号专科中文名）为输入，经 `resolveSpecialtiesForIngest` 归一回同一专科键：预灌专科与入库科室恒一致，消除「入库一个科、预灌另一个科」 |
| mismatch 强闸门 | 候选带 `department_mismatch` 时 `add_hcp` 新增可选参数 `confirm_department_checked: true` 才放行：未带 → 返回非错误信封 `{ status: "department_confirmation_required", department_mismatch, repair_hint }`，不写库、不作废令牌；带 → 写库且科室取信号侧，返回体附 `department_checked: true` |
| 无信号阻断 | 候选 `department_signal.specialty` 缺失（无信号或归一不出专科键）→ `VALIDATION_ERROR`，`details.code` 为 `DEPARTMENT_SIGNAL_MISSING`（McpErrorCode 枚举封闭，细分码置于 details），`repair_hint` 提示换检索条件重查（`query_hcp` 重检出带信号候选）或人工核实；不写库、不作废令牌、不降级为原样入库 |
| 科室不可人工改写 | `add_hcp` schema 不出现科室入参；候选载荷 `department`（输入原文）只作检索提示与 mismatch 对照，不落库；Web 确认页无科室编辑入口（[app-design §6](../app/app-design.md)） |
| 来源留痕 | 写库 twin 的 `tags.evidence_refs` 在 `confirm_identity` 之外按实际来源追加 `department_signal`；经 mismatch 闸门放行时再追加 `department_checked` |
| 兜底不变 | `confirm_not_duplicate`（ADR-009 同名查重）、`refresh`（ADR-013）、`knowledge_jobs`（ADR-014）语义与触发时机均不变；闸门分支不触发 build、不预灌 |

#### 数据流（增补后）

```text
调用方输入科室（仅检索提示，不入库）
  → twin-mcp resolve（来源标注 + OpenAlex 主题/机构信号对照，mismatch 判定）
  → query_hcp include_external 候选透传（provenance / signal / mismatch）
  → add_hcp 确认：
      department_signal.specialty 缺失 → DEPARTMENT_SIGNAL_MISSING 阻断
      department_mismatch 且未 confirm_department_checked → department_confirmation_required
      其余 → 入库科室 = 信号专科中文名；specialty_preview 与预灌同源一致
  → Web 确认页（信号专科展示 + 闸门勾选 + 映射预览，US-WEB-004 增补）
```

#### 实现落点

- `@hca/medical-kb`：新增并导出 `specialtyDisplayName(key)`（受控专科键 → 标准中文名反查；与 `ALIAS_MAP` 同源维护）；单元测试先红。
- `packages/hcp-engagement-mcp`：`add_hcp` schema 增可选 `confirm_department_checked`；令牌命中后按上表三分支处理；`ResolveCandidateInput` / `CandidatePayload` 不加新字段（复用 `department_signal`）。
- Web BFF `/api/twins/confirm` 同步同规则（科室取候选信号专科、闸门同参）；`apps/web` 确认页无编辑入口。
- 对内 `resolve_hcp_identity` 契约不变（[mcp-design · MCP2-09 节](../mcp/mcp-design.md)）：候选 `department` 仍原样回显输入、`department_provenance.origin` 仍 `caller_input`；改写只发生在 `add_hcp` 入库一步。

## 14. feature-08 `ingest_academic` / `get_ingest_status` 技术设计（Sprint 2，ADR-014）

> 故事：[US-MCP2-008](./mcp2-stories.md) · 测试：[mcp2-test §16](./mcp2-test.md) · 需求：[pb-11](../product-backlog.md#pb-11) · 底层接口：[I-RAG-003 / I-RAG-004](../rag/rag-function-spec.md) · [ADR-014 决策 3](../../docs/adr/ADR-014-retrieve-coverage-signal-and-academic-ingest.md)

### 14.1 动因与范围

- ADR-014 背景：MCP 调用方没有「Twin 确认」动作，拿不到 `add_hcp` 式预灌；`retrieve_academic` 稀疏只能建议补种，调用方无法自助完成。
- 本节两件事：注册 `ingest_academic`（按受控专科显式触发 `ingest_on_demand`，立即返回 job 引用）与 `get_ingest_status`（按 `job_id` 或 `specialty` 查进度）。
- 范围外：不改 `ingest_on_demand` / `getIngestStatus` 接口签名（I-RAG-003 / I-RAG-004 不动）；不动 Web；不透传 `hcpId` / `force`（`hcp_id` 不作入参，灌注以专科为粒度、与调用方身份无关；`force` 为内部运维专用，绕过幂等门控的能力不对外）。

### 14.2 工具契约

| 项 | `ingest_academic` | `get_ingest_status` |
| --- | --- | --- |
| 入参 | `specialty`（必填；受控专科键或其中英文别名，服务端归一化）；`themes`（可选，原样透传聚焦拉取） | `job_id` 或 `specialty` 至少传一 |
| 返回 | `{ job_id, knowledge_status }`：`pending`（已起异步 job）；`ready`（coverage 门控幂等跳过，复用最近 ready job 引用） | `{ job_id, specialty?, status, knowledge_status, progress?, error? }` |
| 失败 | `VALIDATION_ERROR`（无法归一化出受控键或缺参）；`INGEST_IN_PROGRESS`；`INTERNAL_ERROR` | `VALIDATION_ERROR`（两参皆缺）；`NOT_FOUND`（job 不存在或专科无 job 记录）；`INTERNAL_ERROR` |
| Annotations | `readOnlyHint: false`（知识面幂等写，ADR-013 修订先例）、`openWorldHint: true`（公开源拉取） | `readOnlyHint: true`、`openWorldHint: false` |

| 规则 | 行为 |
| --- | --- |
| 受控键归一化 | `specialty` 入参经 `normalizeSpecialty`（`ALIAS_MAP` 中英文别名，28 受控专科）归一化；归一不出受控键 → `VALIDATION_ERROR`，不创建 job |
| coverage 门控 | 与 Web confirm 预灌同源同语义：`coverageCheck` 为 ready → 幂等跳过（不重复拉公开源），返回 `knowledge_status: "ready"` 与最近 ready job 引用（无历史 job 时落一条 ready 口径 job 记录） |
| 同专科互斥 | 底层 `INGEST_IN_PROGRESS`（错误 `details.jobId`）映射为对外错误信封 `code: INGEST_IN_PROGRESS`：`details` 以 snake_case 附进行中 `job_id` 与 `specialty`（pb-11「返回进行中 job」经此实现），`repair_hint` 指向 `get_ingest_status` 轮询或稍后重试 |
| 立即返回 | 异步 job（PubMed / OpenAlex → corpus → embed → upsert）不阻塞工具返回；进度只经 `get_ingest_status` 查询 |
| 不写 Twin | `knowledge_status` 权威在 `rag_ingest_jobs` / `ingest_manifest`（F-RAG-017），不写 Twin JSON、不触发 HCP build |
| 字段命名 | 对外 snake_case（`job_id`），handler 映射底层 camelCase（`jobId`），同既有工具先例 |

### 14.3 数据流

```text
MCP Client
   │ ingest_academic({ specialty, themes? })
   ▼
handler（packages/hcp-engagement-mcp）
   │ normalizeSpecialty → 受控键（失败 → VALIDATION_ERROR）
   │ IngestOnDemandFn（注入项，缺省 medical-kb ingestOnDemand 经 agent 包再导出）：
   │   同专科进行中 → INGEST_IN_PROGRESS（details 附进行中 job_id）
   │   coverage ready → 幂等跳过，返回 ready job 引用
   │   否则 → 创建 pending job，异步拉取，立即返回
   ▼
{ job_id, knowledge_status }

MCP Client
   │ get_ingest_status({ job_id } 或 { specialty })
   ▼
GetIngestStatusFn（注入项，缺省同上）
   ▼
{ job_id, specialty?, status, knowledge_status, progress?, error? }

retrieve_academic coverage.status 为 sparse
   → repair_hint 点名 ingest_academic（§12 既定分界的收口，归本 SBI）
```

### 14.4 实现落点

- `@hca/hcp-engagement-agent`：再导出 `ingestOnDemand` / `getIngestStatus`（同 coverage 再导出先例）；mcp 包依赖不变（仍只依赖 agent 包，无新包依赖）。
- mcp 包 `CreateMcpServerOptions` 增 `ingestOnDemand` / `getIngestStatus` 注入项（测试注入 fake，同 `TriggerIngestFn` 先例）；注册两工具，Zod schema：`specialty` 归一化入参、`themes` 可选；`get_ingest_status` `job_id` / `specialty` 二选一。
- `retrieve_academic` sparse `repair_hint` 文案升级为点名 `ingest_academic`（§12 分界收口）。
- 环境：同 §10 / §12（Qdrant + MySQL；PubMed / OpenAlex 可达时拉公开源，否则 fixture 兜底）。
- 开工注意（[sprint-backlog Future actions #4](../sprint-backlog.md)）：本 SBI 依赖 `@hca/*` 跨包新导出，先重建上游 dist 再跑下游测试。
