# ADR-004: 同一 HCP 多 OpenAlex Author ID 并存

## 状态
已采纳（部分取代 ADR-002 的「仅改绑」后果）

## 背景
OpenAlex 对同一真实 HCP 常存在多个 Author 簇（中文显示名簇与拉丁名簇、重复建档等）。消歧页可能列出多个候选，各自带不同 OpenAlex ID。原实现强制单选一位，且 `AuthorIds.openalex` 为标量；Stage A 在命中拉丁簇时**改绑覆盖**旧 ID，导致文献覆盖面丢失。ADR-002 已承认多簇并存是数据现实，但未规定如何同时绑定。

## 决策
1. **主 ID + 别名**：`research.author_ids.openalex`（及镜像 `profile.external_ids`）仍为**主** OpenAlex Author ID；新增 `openalex_aliases: string[]` 存放其余已确认绑定的 OpenAlex ID（去重、不含 primary）。
2. **消歧合并**：用户可多选 resolve 候选，合并确认为一个 Twin；`hcpId` 取主候选（MVP）；合并后写入 primary + aliases。
3. **构建 Stage C**：对 `openalex ∪ openalex_aliases` 分别拉取 works，再按 DOI（优先）或归一化标题去重。
4. **Stage A 与 ADR-002**：命中拉丁簇时，若当前 primary 为中文簇，可将拉丁簇**升为 primary**，旧 ID **写入 aliases**（不再静默丢弃）；若当前已是拉丁簇，新命中写入 aliases。

## 原因
- 单 OpenAlex ID 无法覆盖同人多簇文献。
- 保留标量 `openalex` 可兼容现有 P0 门禁、UI 行与历史 twin。
- 主键 `hcp_id` 解耦为非 OpenAlex 派生成本更高，MVP 仍用主候选的 `hcp_*`。

## 后果
- 须修订数据字典 §3.2.1、F-WEB-012/013、confirm 入参与构建管线。
- 误合并异人风险上升：确认页须列出将绑定的全部 OpenAlex 与机构；不自动全选。
- ADR-002 关于「改绑可能改变灌库集合」的后果改为「主/别名集合变更可审计」。

## 日期
2026-07-22
