# ADR-013: 洞察 LLM 合成的触发模型与幂等回填

日期：2026-10-20
状态：Accepted（修订 ADR-012）
关联：ADR-012（MCP 2.0 只做数据面）、TWIN2-01（定时刷新）、MCP2-03（get_hcp_insights）

## 背景

一句话洞察（`doing_now`）的 LLM 合成目前只在 Web/BFF 侧（`POST /api/insights/doing-now`，`synthesizeDoingNow`）。对外 MCP 的 `get_hcp_insights` 设计为纯读存量；`add_hcp` 写空模板且不触发构建。结果：不经网页的 MCP 调用方拿不到 LLM 洞察，链路不闭环。

## 决策

1. **统一入口 `ensureDoingNow(hcpId)`**：服务器侧幂等合成入口，复用 `synthesizeDoingNow` 的 `reused` 语义。合成成功写回 `hcp_insights` 缓存；同一 HCP 已有进行中的 run 时直接返回该 run，不重复起任务。
2. **三个触发源收敛到同一入口**：
   - build 完成：对内 `hcp-twin-mcp` build 管线结束后调用（含 TWIN2-01 定时刷新与 add_hcp 异步触发经过的同一管线）。
   - TWIN2-01 定时：调度器逐 HCP 刷新后经 build 完成回调触发。
   - 工具内按需：`get_hcp_insights` 读到空模板且 Twin 事实足够时，服务器内同步合成一次并写回。
3. **`add_hcp` 异步触发刷新**：写库成功后异步起一次 build（不阻塞返回），返回体增加 `refresh: { run_id }` 提示；调用方用既有 `get_twin_status` 查询进度。失败不回滚写入，只记日志。
4. **LLM 失败降级**：合成失败时 `get_hcp_insights` 返回空模板加 `pending: true` 状态，不返回 `INTERNAL_ERROR`。
5. **annotations 修订**：`get_hcp_insights` 的 `readOnlyHint` 从 `true` 改为 `false`。对 ADR-012 的修订说明：洞察缓存回填属**数据面幂等写**（写的是同一资源的缓存字段，非新建资源、非决策输出），不违反「决策面不经对外 MCP」的边界；一人一策、开放对话、合规预审仍不经对外 MCP。

## 后果

- MCP 调用方在不打开网页的情况下也能拿到 LLM 洞察；首次调用可能触发一次合成，时延高于纯读。
- `hcp_insights` 成为可被数据面写回的缓存，测试需覆盖幂等与并发去重。
- ADR-012 的工具表 `get_hcp_insights` 行以本 ADR 为准。
