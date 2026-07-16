# hcp-twin-mcp 功能规格

> as_of：2026-07-16 · 包名建议 `@hca/hcp-twin-mcp`  
> 依据：[`1.product-definition.md`](../1.product-definition.md)、[`3.architecture.md`](../3.architecture.md) §5.2、[`4.install-dependencies.md`](../4.install-dependencies.md) §5、[`5.hcp-twin-data-dictionary.md`](../5.hcp-twin-data-dictionary.md)、[`../app/app-function-spec.md`](../app/app-function-spec.md)、[`../../knowledge/hcp-twin/hcp-tagging.md`](../../knowledge/hcp-twin/hcp-tagging.md)、[`../../knowledge/hcp-twin/twin-data-structure.md`](../../knowledge/hcp-twin/twin-data-structure.md)、**mcp-server-patterns**  
> 范围：`packages/hcp-twin-mcp` — Twin 采集 MCP Server（**Tools / Resources** + 内部 Collectors）。不含 Web UI、BFF 路由、Agent、medical-kb 实现；与 BFF 的契约以本文件对外接口表为准。  
> **相对架构补全**：架构 §5.2.1 未列 `tag_hcp` / `health_check`；本规格将其列为正式对外 Tool（与 skill / 安装文档一致）。

## 0. 结论（先读）

| 原则 | 要求 |
|------|------|
| Schema first | 每个 Tool 先有 Zod 入参 + 文档化出参；实现前契约测试可跑 mock |
| 传输解耦 | Tools/Resources 注册与业务逻辑不依赖传输；入口只切换 `stdio` / Streamable HTTP |
| 浏览器隔离 | 浏览器只调 BFF；BFF 用 `mcp-client`；禁止浏览器直连 `:3200` |
| Playwright 隔离 | Chromium **仅**本进程；`apps/web` 禁止依赖 playwright |
| 落盘共卷 | 写 `HCA_DATA_DIR/twins/{hcpId}/`；与 BFF、Agent 共享 |
| 合规 | 仅公开信息；禁止处方/统方/非公开 CRM；热力禁止拜访笔记冒充 |
| 批次 | 功能与接口「实现批次」**默认 TBD** |

MCP 原语用法：对外暴露 **Tools（动作）** + **Resources（只读 URI）**；**Prompts 本包 P0 不做**（不注册 `registerPrompt`）。

---

## 实现批次说明

排期时再填入下表代号；当前表内一律 TBD。

| 批次 | 目标 | 验收重心 |
|------|------|----------|
| **M0** | MCP 壳与契约 | 传输解耦、Zod、`health_check`、`TWIN_MODE=mock`、JSON 可写、结构化错误 |
| **M1** | 身份与打标 | `resolve_hcp_identity`、AuthorIds、`tag_hcp`、Stage A 末 tags |
| **M2** | Twin 构建闭环 | `build_twin` + `get_twin_status`；Career/Research；Insights；`get_twin` / `get_insights` |
| **M3** | 热力与 Resources | Heatmap、空窗、增量/cron、三条 `twin://` Resource |
| **M4** | 硬化与验收 | 限速、队列、KOL §16 对照、朱同玉 live |
| **TBD** | 未排期（默认） | 已定义、顺序待定 |

---

## 功能列表

| 序号 | 功能编号 | 功能名称 | 功能简述 | 实现批次 |
|------|----------|----------|----------|----------|
| 1 | F-MCP-001 | MCP Server 壳与传输 | `@modelcontextprotocol/sdk`（版本钉死）；业务与传输解耦；本地/Cursor 用 `stdio`；BFF 用 **Streamable HTTP** `:3200`（单端点）；**不**实现遗留 HTTP/SSE，除非明确兼容需求 | TBD |
| 2 | F-MCP-002 | Tool/Resource 注册 | 用 SDK 当前 API（`tool`/`resource` 或 `registerTool`/`registerResource`）注册；实现前对照官方 MCP 文档或 Context7，避免过时签名 | TBD |
| 3 | F-MCP-003 | 输入 Zod 校验 | 每个 Tool 入参 Zod；失败返回**结构化**错误（`code` + 可读 `message`），不向 Client 抛原始堆栈 | TBD |
| 4 | F-MCP-004 | Tool 描述可机读 | 每个 Tool 的 `description` 写清：副作用、是否幂等、限速/成本、何时调用；供 Cursor/Agent 选 Tool | TBD |
| 5 | F-MCP-005 | 健康检查 | `health_check`：进程存活、`HCA_DATA_DIR` 可写、可选 Playwright/Chromium 就绪；供 BFF `GET /api/health` | TBD |
| 6 | F-MCP-006 | Twin 模式切换 | `TWIN_MODE=live`（默认）\| `mock`；mock **零外网**，读 fixture；产品验收必须 live | TBD |
| 7 | F-MCP-007 | 原子 JSON 落盘 | 写 `identity.json` / `twin.json` / `insights.json`（及可选拆分文件）；临时文件 + rename；破坏性变更升 `schema_version` | TBD |
| 8 | F-MCP-008 | 证据元数据强制 | 事实字段：`source_url` / `source_type` / `as_of` / `confidence`；冲突写 `conflict_note` | TBD |
| 9 | F-MCP-009 | 合规采集边界 | 仅公开源；禁止处方/统方/非公开 CRM/私人手机微信号营销画像；活动不得用拜访笔记冒充 `events` | TBD |
| 10 | F-MCP-010 | Playwright 进程隔离 | Chromium 仅本 MCP；并发浏览器上下文有上限；`CRAWLER_HEADLESS` 可配 | TBD |
| 11 | F-MCP-011 | 外网限速与成本 | PubMed/NCBI（尊重 `NCBI_API_KEY` 配额）、OpenAlex、Playwright 导航：限速、超时、可重试；失败进结构化错误 | TBD |
| 12 | F-MCP-012 | 身份消歧（resolve） | 姓名+医院+科室 → `url_candidates[]`、候选 AuthorIds、`disambiguation_status`；**未确认前不强制落盘完整 Twin**（可写草稿/会话态由 BFF 持有） | TBD |
| 13 | F-MCP-013 | AuthorIds 绑定 | 权威在 `research.author_ids`；镜像/扩展在 `profile.external_ids`；P0：orcid / pubmed_author / google_scholar / openalex；`resolved` ⇒ ≥1 个 P0 号非空 | TBD |
| 14 | F-MCP-014 | 文献灌库门禁 | Stage C 前校验数据字典 §3.2.1；未满足则**跳过/拒绝**论文灌库并返回可修复错误；禁止仅中文姓名灌库 | TBD |
| 15 | F-MCP-015 | 级别打标（Tagging） | 规则优先写 `profile.tags`：`hcp_tier` + `role_tags[]` + meta；禁止处方潜力；可选 LLM 建议，冲突时规则胜出 | TBD |
| 16 | F-MCP-016 | 打标触发点 | （1）`resolve_hcp_identity` 成功后可带 tags 草稿；（2）`build_twin` Stage A 末写入；（3）独立 `tag_hcp` 重算 | TBD |
| 17 | F-MCP-017 | 用户覆盖标签 | `tag_hcp` 接受覆盖载荷，`tag_method=user_override`；后续规则重算默认不静默覆盖 user_override（除非 `force_rule=true`） | TBD |
| 18 | F-MCP-018 | Twin 构建编排 | `build_twin(mode=full\|incremental)` → 立即返回 `runId`；后台跑 Stage A→E；**同一 `hcpId` 同时仅一个 active run**（冲突返回明确错误） | TBD |
| 19 | F-MCP-019 | Stage A 身份锚点 | 锁定主页 URL + AuthorIds + 基础 profile + tagging | TBD |
| 20 | F-MCP-020 | Stage B Career Collector | 医院/大学页 → education / positions / society_roles → `career-timeline.json`（或并入 twin） | TBD |
| 21 | F-MCP-021 | Stage C Research Collector | 按 author_ids 拉文 → recent_pubs、themes、trend_shift、lab；专利/基金 P1 | TBD |
| 22 | F-MCP-022 | Stage D Heatmap Collector | 会务/新闻 → events；窗：更早 \| d90 \| d60 \| d30；分桶 academic \| policy_media；空窗 `no_public_evidence` | TBD |
| 23 | F-MCP-023 | Stage E Insights 衍生 | `doing_now`、`interest_directions`、`opportunities`、合规旁注；政策桶不并入学术兴趣 | TBD |
| 24 | F-MCP-024 | 构建进度查询 | `get_twin_status(runId)` → phase / progress / error；phase 对齐：身份→职业→科研→热力(可跳)→洞察 | TBD |
| 25 | F-MCP-025 | Twin / Insights 读取 | `get_twin` / `get_insights`；不存在时结构化 `NOT_FOUND`，不抛未捕获异常 | TBD |
| 26 | F-MCP-026 | MCP Resources（只读） | 注册 URI 模板 `twin://{hcpId}/career\|research\|heatmap`；`mimeType=application/json`；缺文件 → 可读错误；产品 UI 仍走 BFF | TBD |
| 27 | F-MCP-027 | 异步任务与队列 | 长任务进程内队列起步；可选 Redis；失败可重试；增量幂等边界写进 Tool description | TBD |
| 28 | F-MCP-028 | 热力监控节奏 | 每日/会前扫描；写 `last_polled_at`；非一次性爬取 | TBD |
| 29 | F-MCP-029 | 职业刷新后重打标 | career 季度/增量刷新成功后可调用 `tag_hcp`（尊重 user_override 规则） | TBD |
| 30 | F-MCP-030 | 错误码目录 | 统一 `MCP_ERROR` 形状（见 §错误契约）；覆盖未消歧、缺文献号、源站失败、并发构建、校验失败 | TBD |
| 31 | F-MCP-031 | mock Fixture 路径 | CI 用朱同玉等 fixture 冒烟；零外网 | TBD |
| 32 | F-MCP-032 | Tool 契约测试 | Vitest + `TWIN_MODE=mock` 覆盖全部 Tool I/O 与主要错误码 | TBD |
| 33 | F-MCP-033 | KOL 样本对照验收 | 数据字典 §16：resolve / AuthorIds / specialties / tags 对照断言 | TBD |
| 34 | F-MCP-034 | 朱同玉 live 验收 | live 产出符合字典与 fixture 形状 | TBD |
| 35 | F-MCP-035 | 环境变量与配置 | `MCP_TRANSPORT`、`MCP_PORT`、`HCA_DATA_DIR`、`TWIN_MODE`、`CRAWLER_HEADLESS`、`NCBI_API_KEY`、`REDIS_URL` | TBD |

---

## 对外接口列表

BFF / Cursor / 外部 MCP Client 经 MCP 协议调用。浏览器**禁止**直连。

| 序号 | 接口编号 | 类型 | 接口名称 | 输入摘要（Zod 意向） | 输出摘要 | 副作用 | 幂等 | 实现批次 |
|------|----------|------|----------|----------------------|----------|--------|------|----------|
| 1 | I-MCP-001 | Tool | `resolve_hcp_identity` | `{ name: string, hospital: string, dept: string, city?: string }` | `{ disambiguation_status, hcpId?, url_candidates[], author_ids_draft?, tags_draft?, evidence? }` | 默认可不落盘完整 Twin；若生成稳定 `hcpId` 须在出参标明 | 是 | TBD |
| 2 | I-MCP-002 | Tool | `build_twin` | `{ hcpId: string, mode: "full" \| "incremental" }` | `{ runId: string }`（立即） | 入队异步构建；写 twins 目录 | 否（incremental 可重复调用） | TBD |
| 3 | I-MCP-003 | Tool | `get_twin_status` | `{ runId: string }` | `{ runId, hcpId, phase, progress: 0..1, error?: MCP_ERROR, updated_at }` | 无 | 是 | TBD |
| 4 | I-MCP-004 | Tool | `get_twin` | `{ hcpId: string }` | Twin JSON（对齐数据字典；含 `profile.tags`、`research.author_ids` 等） | 无 | 是 | TBD |
| 5 | I-MCP-005 | Tool | `get_insights` | `{ hcpId: string }` | Insights JSON（`doing_now` / `interest_directions` / `opportunities` 等） | 无 | 是 | TBD |
| 6 | I-MCP-006 | Tool | `tag_hcp` | `{ hcpId: string, force_rule?: boolean, override?: { hcp_tier?, role_tags? } }` | `{ tags: HcpTags }` | 写 `profile.tags`（及 twin.json 对应段） | 是（同入参重复调用结果稳定） | TBD |
| 7 | I-MCP-007 | Tool | `health_check` | `{}` | `{ ok: boolean, data_dir_writable, twin_mode, playwright?: "ready"\|"skip"\|"down", version }` | 无 | 是 | TBD |
| 8 | I-MCP-008 | Resource | `twin://{hcpId}/career` | URI 模板 | career JSON · `application/json` | 无（只读） | — | TBD |
| 9 | I-MCP-009 | Resource | `twin://{hcpId}/research` | URI 模板 | research JSON · `application/json` | 无（只读） | — | TBD |
| 10 | I-MCP-010 | Resource | `twin://{hcpId}/heatmap` | URI 模板 | activity/heatmap 切片 JSON · `application/json` | 无（只读） | — | TBD |

### 接口与产品功能映射（摘）

| MCP 接口 | 主要消费方 | 对应 Web 功能（摘） |
|----------|------------|---------------------|
| `resolve_hcp_identity` | BFF | F-WEB-011 查询 HCP |
| `build_twin` | BFF | F-WEB-013 确认并保存 |
| `get_twin_status` | BFF | F-WEB-014 构建进度 |
| `get_twin` / Resources | BFF / Cursor | F-WEB-007 / 015 / 016 等 |
| `get_insights` | BFF | F-WEB-017…024 |
| `tag_hcp`（及 resolve/Stage A 内嵌） | BFF / MCP | F-WEB-006 级别标签 |
| `health_check` | BFF | `/api/health` |

### Tagging 契约（不得遗漏）

| 项 | 约定 |
|----|------|
| 主标 | `hcp_tier`: `T1` \| `T2` \| `T3` \| `unclassified` |
| 辅标 | `role_tags[]`：与 `role_labels` 同构（kol / kme / administrator / policy_voice / frontline / …） |
| 元数据 | `tag_confidence`, `tag_as_of`, `tag_method`（`rule` \| `llm_assisted` \| `user_override`）, `evidence_refs` |
| 写入路径 | `profile.tags`；权威：数据字典 §3.5、`hcp-tagging.md` |
| 对外入口 | **Tool `tag_hcp`（I-MCP-006）** + resolve / Stage A 自动打标（F-MCP-015/016） |
| 覆盖规则 | `user_override` 优先；`force_rule=true` 才允许规则盖过用户覆盖 |

### 错误契约（结构化）

所有 Tool 失败时返回可解析对象（嵌入 MCP tool result text/structured content），形状建议：

```text
MCP_ERROR {
  code: enum,
  message: string,          // 给人/模型读的短句
  repair_hint?: string,     // 可修复提示（如「补 ORCID」）
  details?: object,         // 无密钥、无堆栈
  retryable: boolean
}
```

| code | 典型场景 | retryable |
|------|----------|-----------|
| `VALIDATION_ERROR` | Zod 失败 | 否 |
| `NOT_FOUND` | 未知 hcpId / runId / Resource | 否 |
| `UNRESOLVED_IDENTITY` | 消歧未完成却要灌科研 | 否 |
| `AUTHOR_IDS_REQUIRED` | Stage C 门禁 | 否 |
| `BUILD_IN_PROGRESS` | 同 hcpId 已有 active run | 是（稍后） |
| `SOURCE_UNAVAILABLE` | 源站/API 超时或 5xx | 是 |
| `RATE_LIMITED` | NCBI 等限速 | 是 |
| `COMPLIANCE_BLOCKED` | 请求触及禁止数据类 | 否 |
| `INTERNAL_ERROR` | 未分类内部失败 | 视情况 |

### Tool 副作用与调用顺序（给 Client）

```text
resolve_hcp_identity  →  用户确认候选（BFF）  →  build_twin
                              ↓
                         get_twin_status（轮询）
                              ↓
                    get_twin / get_insights
                              ↓
                    tag_hcp（可选重算或用户覆盖）

任意时刻：health_check
Cursor 调试：Resources twin://…（只读，不替代 BFF）
```

---

## 依赖关系（简图）

排期后参考（当前均为 TBD）：

```text
M0 壳 / Zod / health / mock / 错误契约
  └─► M1 resolve + AuthorIds + tag_hcp
        └─► M2 build_twin（A→B→C→E）+ get_* 
              └─► M3 heatmap + Resources + 增量/cron
                    └─► M4 限速/队列 + §16 / live 验收
```

Collector 流水线（**内部**，非独立 Tool）：

```text
Stage A 身份+AuthorIds+tags
  → Stage B Career
  → Stage C Research（须过 AuthorIds 门禁）
  → Stage D Heatmap（可异步/可空窗）
  → Stage E Insights
```

---

## 非目标

- Web UI / BFF 路由（见 [`../app/app-function-spec.md`](../app/app-function-spec.md)）
- MCP **Prompts** 注册（P0 不做）
- 遗留 HTTP+SSE 传输（除非另开需求）
- `cancel_build` / `delete_twin` Tool（删除由 BFF 管文件系统即可；取消构建若需要另开需求）
- `hcp-engagement-agent`、一人一策生成
- medical-kb / Qdrant ingest（Twin 只提供 specialties/themes 信号）
- 正式 MLR、处方/统方数据源

---

## Open questions

- [ ] `resolve_hcp_identity` 是否在消歧成功时写入 `identity.json`，还是完全由 BFF「确认并保存」后首次落盘
- [ ] Stage D 失败时 Stage E 是否仍可基于论文+职业出 Insights（建议：可，热力标空窗）
- [ ] `tag_hcp` 是否允许在 Twin 未 `build` 完成时仅凭 resolve 草稿打标并落盘

---

## 相关文档

- 架构：[`3.architecture.md`](../3.architecture.md) §5.2
- 依赖与环境：[`4.install-dependencies.md`](../4.install-dependencies.md) §5
- 数据字典：[`5.hcp-twin-data-dictionary.md`](../5.hcp-twin-data-dictionary.md)（§3.2 AuthorIds · §3.5 tags）
- Web 功能：[`../app/app-function-spec.md`](../app/app-function-spec.md)
- 打标：[`../../knowledge/hcp-twin/hcp-tagging.md`](../../knowledge/hcp-twin/hcp-tagging.md)
- 结构分类：[`../../knowledge/hcp-twin/twin-data-structure.md`](../../knowledge/hcp-twin/twin-data-structure.md)
- 取数路径：[`../../knowledge/mcp-hcp-virtual-twin/data-sources-zhu-tongyu.md`](../../knowledge/mcp-hcp-virtual-twin/data-sources-zhu-tongyu.md)
- 模式：项目 skill `mcp-server-patterns`；官方 [MCP docs](https://modelcontextprotocol.io)
