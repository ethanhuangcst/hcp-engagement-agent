# 对外 MCP 2.0 设计

> as_of：2026-10-20（新增 §7 feature-02 list_hcp；新增 §8 feature-03 add_hcp，含写前查重 ADR-009；OGT-1 并入库外检索与候选令牌，ADR-010；医院/科室过滤包含匹配，ADR-011；ADR-012 对外仅数据面：MCP2-04/05 改 `retrieve_academic` / `retrieve_compliance`）  
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
| 注册 | 六工具分三 sprint 落地；handler 调共享库，不复制 BFF 路由逻辑。task-01 已注册 `list_hcp`/`query_hcp`/`add_hcp`（stub handler 返回结构化 `INTERNAL_ERROR`） |
| 配置 | `DATABASE_URL`、LLM/RAG 与 Web 同源 env；密钥仅进程环境。2.0 专属键：`MCP2_PORT`、`TWIN_REFRESH_CRON`、`TWIN_REFRESH_TTL_HOURS`（`MCP2_TRANSPORT` 已随 stdio 移除）；`MCP_URL`（对内 hcp-twin-mcp HTTP 基址，库外检索数据源，ADR-010） |

## 3. 工具 → 依赖映射

| 工具 | 读/写 | 主要依赖 |
| --- | --- | --- |
| `list_hcp` | 读 | `@hca/db` `listTwins` |
| `query_hcp` | 读 | `@hca/db` `queryTwins`（`hcp_id` 走 `getTwin`；姓名过滤见 §6）；`include_external` → 对内 `resolve_hcp_identity`（HTTP，ADR-010，见 §6 增补） |
| `add_hcp` | 写 + 异步触发刷新（ADR-013） | 候选令牌（ADR-010）→ 确认保存路径（对齐 `/api/twins/confirm`）；写库成功后异步起一次 build，返回 `refresh: { run_id }`（详见 §8 增补） |
| `get_hcp_insights` | 读 + 按需幂等回填（ADR-013） | `@hca/db` insights + twin；空模板且事实足够时服务器内经 `ensureDoingNow` 合成并写回（详见 §9） |
| `retrieve_academic` | 读 | `@hca/medical-kb` 学术检索（对齐 Agent I-AGT-007；MCP2-04，Sprint 2，ADR-012） |
| `retrieve_compliance` | 读 | `@hca/medical-kb` 合规检索（对齐 Agent I-AGT-008；`tenant_id` 来自服务端鉴权上下文，MCP2-05，Sprint 3，ADR-012） |

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
   │ getTwin + getInsights（@hca/db）
   ├─ doing_now 已存在 → 直接返回（纯读路径）
   └─ 空模板且事实足够 → ensureDoingNow(hcpId)（服务器内同步合成，复用 synthesizeDoingNow 的 reused 语义）
        ├─ 成功 → 写回 hcp_insights 缓存，返回完整 insights
        ├─ 进行中 run → 返回该 run 对应的当前状态（不重复起任务）
        └─ LLM 失败 → 返回空模板 + pending: true，不报 INTERNAL_ERROR
```

| 规则 | 行为 |
| --- | --- |
| 入参 | `hcp_id` 必填；不存在的编号 → `NOT_FOUND` |
| 纯读路径 | `insights.doing_now` 已存在：不调 LLM、不写库，行为与纯读一致 |
| 按需合成 | `doing_now` 为空且 Twin 事实（专长、主题、标签等）足够时调用 `ensureDoingNow`；同一 HCP 已有进行中的 run 时复用该 run（去重），不并发起第二个任务 |
| 事实不足 | Twin 无足够事实（如身份 twin 刚建、无专长与主题）：不调 LLM，返回空模板 + `pending: true`，`repair_hint` 指明等待 TWIN2-01 刷新或 Web 编辑补充 |
| 降级 | LLM 失败、超时、无 Key：返回空模板 + `pending: true`；错误记结构化日志，不映射 `INTERNAL_ERROR` |
| 写回 | 合成结果写 `hcp_insights`（幂等缓存回填，ADR-013）；失败时不写，下次调用重试 |
| 返回 | `{ twin, insights }`；按需合成发生的调用在 insights 顶层附 `synthesized: true` 标记，便于调用方区分即时合成与存量 |
| Annotations | `readOnlyHint: false`（幂等缓存回填，ADR-012 修订见 ADR-013）、`openWorldHint: false` |

实现落点：

- `ensureDoingNow(hcpId)` 落在 Agent/BFF 侧既有 `synthesizeDoingNow` 同层（收敛为共享服务），三个触发源（build 完成、TWIN2-01 定时、本工具按需）调用同一入口；本故事补齐该入口并把 `get_hcp_insights` 接上。
- handler 对 `ensureDoingNow` 与 `getInsights`/`getTwin` 采用注入，同 §7 模式，便于契约测试注入假 LLM 与假库。
- 环境需要 `DATABASE_URL` 与 LLM Key（与 Web 合成同一配置）；Key 缺失走降级路径，不算配置错误。
