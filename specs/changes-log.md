# 变更记录（HCP Engagement Assistant）

> 类型：Framework (process) artifact，产品：HCP Engagement Assistant
> as_of: 2026-10-19
> [Definition](../.cursor/templates/framework.sdd.works/sdd-scrum-practices.md#changes-logmd)

---

## 2026-10-19

### 更新 artifacts-map 与技术规格索引

**原因**：`sdd-audit-artifacts` 需 Usable；2.0 对外 MCP 需可打开的 function-spec。

**变更内容**：
- `artifacts-map.json`：五 process 文件、各模块 `*-function-spec.md`、`specs/mcp2.0/mcp2-function-spec.md`；移除不存在的 `specs/.secrets`。
- 新建 `specs/adr/`、`specs/knowledge/` 占位目录。

**验收**：审计打开 map 所列路径无 failed；`specs/.secrets` 不再出现在 map（密钥仍用 `.env` / `.env.example`）。

---

## 2026-10-19

### mcp2.0 工程三件套与 release.md

**原因**：审计与 Sprint 1 需要可打开的 design / stories / test；发布说明独立于 spec1.0。

**变更内容**：新增 `specs/mcp2.0/mcp2-design.md`、`mcp2-stories.md`、`mcp2-test.md`、`specs/release.md`；更新 `artifacts-map.json` 与 sprint-backlog `task-01` 引用。

**验收**：`sdd-audit-artifacts` 为 Usable。

---

## 2026-10-19

### 移除 mcp2-function-spec 索引

**原因**：2.0 对外 MCP 契约以 `product-backlog.md` 为准，不单独维护 `mcp2-function-spec.md`。

**变更内容**：删除 `specs/mcp2.0/mcp2-function-spec.md`；`artifacts-map.json` 中 `mcp2.0` 模块 `files` 为空。

**验收**：`sdd-audit-artifacts` 为 Usable。

---

## 2026-10-19

### 2.0 三轮 Sprint 排期（Sprint 1–3 Option A）

**原因**：用户确认 Sprint 1–3 均为 Option A；Sprint 1 增加对外 MCP 2.0 骨架 Task。

**变更内容**：
- `specs/product-backlog.md`：8 条 Implementable PBI 的 `Sprint` 列由 — 设为 Sprint 1 / 2 / 3。
- `specs/sprint-backlog.md`：新建 Sprint 1–3 段落与 SBI 表；Sprint 1 含 `task-01` 与三条 Feature SBI。
- `specs/status.md`：新建，当前 Sprint 1 ToDo。
- `specs/issues-log.md`：新建空表。

**验收**：`product-backlog.md` 与 `sprint-backlog.md` 中 PBI 与 SBI 一一对应；未排期 PBI 表为空。

**边界**：不含代码实现与 `artifacts-map.json` 索引更新。
