# hcp-engagement-agent — 测试策略与计划（agent 模块）

> as_of：2026-10-21（新增于 feature-03 开工准备批次：AGT2-01 ROCKS 模板版本化、评测门禁与降级，US-AGT-007 / US-AGT-008）

**Area:** `packages/agent` 三类 LLM 输出路径（propose / revise / synthesize / open_chat）的模板版本化、eval 门禁、时延预算与超时降级
**Stories:** [agent-stories.md](./agent-stories.md) US-AGT-007 / 008 · Design: [agent-design.md](./agent-design.md) §13 · Functions: [agent-function-spec.md](./agent-function-spec.md) Sprint 2 增补节（F-AGT-031 ~ 034）
**Quality bar:** extends **common-test-strategy** — critical path 100%，overall ≥80% where measurable。基线 [spec1.0/7.test-strategy.md](../spec1.0/7.test-strategy.md)（更严者胜）。

## 1. 范围（AGT2-01 增量）

| 层 | 对象 | 默认 CI | Live opt-in |
| --- | --- | --- | --- |
| 单元 | 模板注册表形状、元数据接线、计时降级（mock `LlmClient`） | Always | — |
| 回归 | `packages/agent` 既有 33 例不回退（契约字段只增不改） | Always | — |
| eval 门禁 | 三类任务 15 例（各 5，朱同玉 fixture 锚点）过门槛且无红线 | — | opt-in（`npm run eval:agent`，需 `LLM_API_KEY`） |
| live 抽检 | 朱同玉三类路径实测，预算值回写 agent-design §13.3 | — | opt-in（发版/验收前） |

**Principles**

- mock 模型与 mock 检索照既有测试模式（`chat.test.ts` 等）；默认 CI 零外网、零密钥。
- 降级路径复用既有规则函数，不复制第二套规则。
- eval 报告归档 JSON 摘要，不含密钥、不透传模型原始输出。

## 2. 单元测试

| 模块 | 通过 | 失败或空 |
| --- | --- | --- |
| `prompts/v1` 注册表 | 四模板 `{ name, version: 'v1', text }` 齐全；text 含 ROCKS 五段注释分节且顺序正确 | 缺任一段或任一字段的模板版本不可注册/导出失败 |
| 元数据接线（propose / revise / synthesize / chat） | mock `LlmClient` 下完成一次生成，`meta.template = { name, version }` 与既有 `llm` 字段并列写入 run / summary / session | LLM 失败路径不写半截元数据，错误结构化且无堆栈 |
| 计时与超预算标注 | `latency_ms` 为本次调用 elapsed 毫秒数；超预算时 `over_budget: true` | 计时器异常不吞原错误（计时失败不破坏既有返回值） |
| 超时降级（propose / synthesize） | LLM 抛错或超时 → 返回 `ruleProposeOptions` / `ruleSynthesizeDoingNow` 结果，`degraded: true`，`LLM_UNAVAILABLE` 语义保留 | 规则路径自身输入缺失时返回既有结构化错误，不死循环重试 |

## 3. 回归门禁

- `packages/agent` 既有 33 例（含契约与模式校验）全绿后本故事才可验收；元数据字段只增不改。

## 4. eval 门禁（US-AGT-008）

- 用例分布：一人一策 5 · 开放对话 5 · 一句话洞察 5，合计 15；每类至少 1 例朱同玉 fixture 锚点。
- 门槛：三类各 ≥ 4/5 例达标，且无红线项（编造疗效、伪造引用、会话模式混用）。
- 运行：`npm run eval:agent`（opt-in；`LLM_API_KEY` 读 env，不写入示例文件 or 日志）。
- 落盘：`eval/` 归档 JSON 摘要，作为模板 / 模型变更合入的核验证据；变更 PR 附摘要。

## 5. live 抽检（opt-in）

- 朱同玉：一次 Options 生成、一次开放对话、一次洞察合成实测 `latency_ms`；预算值（agent-design §13.3）据此校准回写。
- 不挡 PR；验收 / 发版前执行一次。

## 相关文档

- Stories: [agent-stories.md](./agent-stories.md) · Design: [agent-design.md](./agent-design.md) · Functions: [agent-function-spec.md](./agent-function-spec.md)
- 全局基线：common-test-strategy · spec1.0: [7.test-strategy.md](../spec1.0/7.test-strategy.md)