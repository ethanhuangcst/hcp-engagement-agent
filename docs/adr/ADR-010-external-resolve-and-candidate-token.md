# ADR-010: query_hcp 并入库外检索与 add_hcp 候选令牌

## 状态
已采纳（修订 mcp2-design §1「不走对内 resolve」边界与 architecture §5.1「工具一经注册只加不改」口径）

## 背景
对外 MCP 2.0 原边界：不暴露 `hcp-twin-mcp`（resolve / build / collectors），`add_hcp` 视调用方已完成身份确认。实际两方面受阻：外部调用方没有合法途径完成「检索消歧」；自填身份字段的写法无法防止凭空建档，库外 HCP 无法通过 MCP 入库。

## 决策
1. `query_hcp` 加可选参数 `include_external`（boolean，默认 false）。为 true 时经 HTTP 调对内 `hcp-twin-mcp` `resolve_hcp_identity`（复用 `@hca/mcp-client`，基址 `MCP_URL`），库外候选放入响应的 `external: { count, items[] }` 块；与库内命中同人的候选不重复出现。
2. 每个库外候选签发 `candidate_id`：进程内 TTL 缓存（默认 30 分钟、LRU 容量上限），值为候选身份、文献号与派生 `hcp_id`（ADR-004 主候选）。
3. `add_hcp` 入参改为 `{ candidate_id, confirm_not_duplicate? }`，身份不再由调用方填写。三道门依次：令牌门（不存在 / 过期 / 已用 → `NOT_FOUND`，repair_hint 指向重新 query_hcp）→ ADR-009 同名查重门（`confirmation_required`）→ 确认保存写库（identity twin + 空 insights，不 build，不 ingest）；成功后令牌作废。
4. 边界修订：build / collectors 仍不暴露；resolve 仅以「query_hcp 库外候选检索」这一受控形态对外。响应降级契约：resolve 超时或失败时库内结果照常返回、`external` 归零并附提示，工具结果不转为失败。
5. 默认 `include_external=false`：已交付的 `query_hcp` 快路径（直接读库、几十毫秒）行为与性能不变；工具 annotations 的 `openWorldHint` 改为 `true`。

## 原因
- 一次完整旅程「query_hcp（含库外候选）→ 人选认 → add_hcp(candidate_id)」对外闭环比照 Web F-WEB-011–013；令牌门强制「必须来自 resolve」，杜绝捏造身份入库。
- 经 HTTP 复用对内 resolve，避免抽共享包的大改；进程耦合只影响库外路径，对内 MCP 不在线时库内查询与已签令牌的新增不受影响。
- 默认关、按需开保护高频库内查询免付秒级外网时延与公开 API 限速。

## 后果
- 对外 MCP 的库外检索路径新增对内 `hcp-twin-mcp` 进程的运行时依赖；该进程离线时仅 `include_external` 无候选（降级），其余工具不受影响。
- 令牌缓存为进程内状态：重启丢失可自愈（重新 query_hcp）；多实例需 Redis，后置。
- `add_hcp` 契约为替换式简化（入参换为 candidate_id），在 feature-03 实现前定稿，无已发布破坏；`query_hcp` 为加式扩展（新可选参数、新响应块），已交付调用方不受影响。

## 日期
2026-10-20