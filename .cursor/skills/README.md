# 项目级 Agent Skills

本目录存放 **HCP Engagement Assistant** 仓库专属 Cursor Agent Skills。克隆本仓库并在 Cursor 中打开项目后，Agent 会自动加载此处技能（无需复制到 `~/.cursor/skills/`）。

## 技能列表

| 技能 | 用途 |
|------|------|
| [cn-hcp-pro](./cn-hcp-pro/SKILL.md) | 中国市场 HCP Engagement 策略与 Options 设计 |
| [cn-hcp-compliance](./cn-hcp-compliance/SKILL.md) | 中国市场学术推广 / Engagement 合规闸门 |

## 使用方式

- 对话中 `@cn-hcp-pro` 或 `@cn-hcp-compliance` 显式调用
- 或描述相关任务（如「设计 Engagement Options」「审核科室会话术」），Agent 会按 `description` 自动匹配

## 与知识库的关系

技能引用本仓库 `knowledge/` 与 `specs/` 中的文档；修改知识库后，技能内的路径锚点应同步更新。

## 评估用例

各技能目录下 `evals/evals.json` 供 skill-creator 回归测试，非运行时依赖。
