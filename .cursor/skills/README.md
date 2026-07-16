# 项目级 Agent Skills

本目录存放 **HCP Engagement Assistant** 仓库专属 Cursor Agent Skills。克隆本仓库并在 Cursor 中打开项目后，Agent 会自动加载此处技能（无需复制到 `~/.cursor/skills/`）。

## 技能列表

### 领域（中国 HCP Engagement）

| 技能 | 用途 |
|------|------|
| [cn-hcp-pro](./cn-hcp-pro/SKILL.md) | 中国市场 HCP Engagement 策略与 Options 设计 |
| [cn-hcp-compliance](./cn-hcp-compliance/SKILL.md) | 中国市场学术推广 / Engagement 合规闸门 |

### 工程（本仓库实现）

| 技能 | 用途 |
|------|------|
| [rag-implementation](./rag-implementation/SKILL.md) | medical-kb 双索引 RAG、Qdrant Hybrid、ingest |
| [mcp-server-patterns](./mcp-server-patterns/SKILL.md) | hcp-twin-mcp 工具、传输、Zod 契约 |
| [agent-builder](./agent-builder/SKILL.md) | hcp-engagement-agent harness、5 tools、轻编排 |

## 使用方式

- 对话中 `@技能名` 显式调用（如 `@rag-implementation`）
- 或描述相关任务，Agent 按各技能 `description` 自动匹配

## 与知识库 / 规格的关系

| 类型 | 路径 |
|------|------|
| 知识库 | `knowledge/` |
| 规格 | `specs/` |
| Twin 数据字典 | `specs/5.hcp-twin-data-dictinoary.md` |

修改知识库或架构后，请同步更新技能内「本项目」锚点段落。

## 评估用例

`cn-hcp-pro`、`cn-hcp-compliance` 目录下 `evals/evals.json` 供 skill-creator 回归测试，非运行时依赖。

## 参考文件

- `rag-implementation/references/details.md` — Hybrid、Parent-Document 等模式
- `agent-builder/references/` — Agent 哲学与示例代码（Python，概念可移植）
