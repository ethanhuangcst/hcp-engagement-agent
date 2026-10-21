# hcp-twin-mcp — 测试策略与计划

> as_of：2026-10-21（2026-10-20 首版：TWIN2-01 定时刷新与洞察回填，ADR-013；2026-10-21 新增 §5 feature-11 增量：resolve 科室来源标注与数据源对照，MCP2-09 / DEF-005）  

**Area:** 对内 Twin MCP（采集、构建、定时刷新）
**Stories:** [mcp-stories.md](./mcp-stories.md) · **Design:** [mcp-design.md](./mcp-design.md)
**Quality bar:** extends **common-test-strategy** — critical path 100%，overall ≥80% where measurable。基线 [spec1.0/7.test-strategy.md](../spec1.0/7.test-strategy.md)（更严者胜）。

## 1. 范围（feature-05 增量）

| 层 | 对象 | 默认 CI | Live opt-in |
| --- | --- | --- | --- |
| 单元 | 调度器（cron 门、TTL 跳过、失败隔离）、构建完成钩子、`ensureDoingNow` 幂等与去重 | Always | — |
| 集成 | 对外 MCP `add_hcp` 契约层的 `refresh` 返回与触发降级 | Always | — |
| E2E | 无浏览器层（本故事无 UI） | — | 实机刷新旅程走 [release.md](../release.md) 冒烟，opt-in |

**Principles**

- 时间与 cron 用 fake timer 或注入时钟，不 sleep。
- 外网采集源与 LLM 全部注入假件；默认 CI 零外网、零生产库。
- 关键路径（env 开关、TTL 跳过、失败隔离、回填去重、触发降级）行覆盖 100%。
- 行为断言放纯函数与队列单测；契约层只验返回形状与错误映射（与 mcp2-test 同一职责划分）。

## 2. 单元测试

| 模块 | 通过 | 失败或空 |
| --- | --- | --- |
| `src/scheduler/`（新建，fake timer） | 未设 `TWIN_REFRESH_CRON` → 不注册任务、从不触发；已设 → 到点触发一轮；TTL 内 HCP 跳过；`_agent_general` 不进刷新范围；到期 HCP 逐个顺序入队 | 单个 HCP 构建抛错 → 本轮继续后续 HCP、日志结构化、Twin 正文不回滚 |
| `src/build/queue.ts`（既有回归 + 钩子） | 成功分支调用 `onBuildComplete(hcpId)` 一次；同 hcpId 单 active run 去重保持（F-MCP-018） | 失败分支不调用钩子；钩子自身抛错 → build 状态仍为成功、队列继续 |
| `ensureDoingNow`（`packages/hcp-engagement-agent`，新入口） | 空模板且事实足够 → 合成并写回 `doing_now`；`doing_now` 已存在 → 直接复用不调 LLM；进行中 run → 返回该 run、不重复起任务 | LLM 失败 / 无 Key → 空模板 + `pending: true`，不抛、不写半成品 |

## 3. 集成测试

| 区域 | 通过 | 失败或空 |
| --- | --- | --- |
| 对外 MCP `add_hcp`（`@hca/hcp-engagement-mcp` 契约层，注入 `AddHcpFn` 与触发件） | 写入成功 → 返回含 `refresh.run_id`；fire-and-forget 不阻塞（响应先于触发完成断言） | 注入触发抛错 / activeRun 冲突 → 返回仍成功且记录已写入；`confirmation_required` 分支不触发 |

## 4. E2E

无。本故事无用户界面；实机验证列入 release.md 冒烟（设置 `TWIN_REFRESH_CRON` 后观察一轮日志与 `as_of` 变化）。

## 5. feature-11 增量（MCP2-09 / DEF-005：resolve 科室来源标注与数据源对照）

故事：[US-MCP-002 后三场景](./mcp-stories.md)；设计：[mcp-design · MCP2-09 节](./mcp-design.md)。

### 单元（`resolveHcpIdentity`）

| 用例 | 断言 |
|------|------|
| 来源标注 | 候选 `department` 回显调用方输入；`department_provenance` 为 `{ origin: "caller_input", verified: false }` |
| fixture 标注 | 朱同玉 fixture 候选 `department_provenance.origin` 为 `fixture`（样例数据诚实标注） |
| 信号归一化 | OpenAlex 主题可归一化时候选附 `department_signal`（主题词原文 + 受控专科键） |
| mismatch | 输入侧键与信号侧键均非空且不同 → `department_mismatch` 为真并附两侧键值；`department` 不被改写 |
| 降级 | 信号缺失或不可归一化 → 仅来源标注，无 signal / mismatch 字段，不报错 |

### 集成（live 用例）

陆林输入「神经科」（归一化 neurology），OpenAlex 主题归一化为 psychiatry：断言候选带 mismatch 提示且确认流程不阻塞（错标场景复现，对应 DEF-005 后果链）。

## 命令

```bash
npm run test -w @hca/hcp-twin-mcp
npm run test -w @hca/hcp-engagement-mcp
npm run test -w @hca/db
```
