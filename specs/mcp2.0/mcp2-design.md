# 对外 MCP 2.0 设计

> as_of：2026-10-19（§6 补逗号、连字符、撇号、行首称谓，以及倒序后的 1 次编辑）  
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
        ✕ 不暴露 hcp-twin-mcp（resolve / build / collectors）
```

- Twin 内容刷新：后台 TWIN2-01，无对外「构建」工具。
- 工具名、入参、返回、Annotations：以 product-backlog「MCP」list 为准。

## 2. 进程与包（目标形态）

| 项 | 说明 |
| --- | --- |
| 包名（定稿） | `@hca/hcp-engagement-mcp`（`packages/hcp-engagement-mcp`，task-01 已建） |
| Transport（定稿，ADR-008） | 仅 Streamable HTTP（stdio 已按 [ADR-008](../../docs/adr/ADR-008-mcp2-http-only-transport.md) 移除）；端口 `MCP2_PORT`（缺省 `3300`），`GET /health` 返回 `{ok, service}`；客户端经 `url` 接入；日志走 stderr |
| 注册 | 六工具分三 sprint 落地；handler 调共享库，不复制 BFF 路由逻辑。task-01 已注册 `list_hcp`/`query_hcp`/`add_hcp`（stub handler 返回结构化 `INTERNAL_ERROR`） |
| 配置 | `DATABASE_URL`、LLM/RAG 与 Web 同源 env；密钥仅进程环境。2.0 专属键：`MCP2_PORT`、`TWIN_REFRESH_CRON`、`TWIN_REFRESH_TTL_HOURS`（`MCP2_TRANSPORT` 已随 stdio 移除） |

## 3. 工具 → 依赖映射

| 工具 | 读/写 | 主要依赖 |
| --- | --- | --- |
| `list_hcp` | 读 | `@hca/db` `listTwins` |
| `query_hcp` | 读 | `@hca/db` `queryTwins`（`hcp_id` 走 `getTwin`；姓名过滤见 §6） |
| `add_hcp` | 写 | 确认保存路径（对齐 `/api/twins/confirm`，不自动 build） |
| `get_hcp_insights` | 读 | `@hca/db` insights + twin |
| `propose_engagement_options` | 写 | `@hca/hcp-engagement-agent` `proposeOptions` |
| `precheck_compliance` | 写 | `@hca/hcp-engagement-agent` `runComplianceGate` |

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
| 仅 `name` | 在已保存医生中过滤。中文名精确。拉丁名见下方「姓名比对」。医院、科室、城市仍精确 |
| 可选过滤 | `hospital`、`department`、`city` 对 `identity` 对应字段做去空格、忽略大小写的相等比较。不做模糊 |
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
