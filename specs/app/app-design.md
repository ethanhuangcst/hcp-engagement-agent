# Web App 设计要点（app-design）

权威视觉与页面骨架见 [`../6.ui-guideline.md`](../6.ui-guideline.md)；可交互原型见 [`hcp-ui-prototype.canvas.tsx`](./hcp-ui-prototype.canvas.tsx)。功能清单与故事见 [`app-function-spec.md`](./app-function-spec.md)、[`app-stories.md`](./app-stories.md)。

## 1. 顶栏多标签壳（Shell）

| 场景 | 行为 |
|------|------|
| 默认顶栏 | 固定两项：**HCP数字分身**（列表）· **HCP Engagement Agent** |
| 打开分身 | 列表点「打开」→ 在「HCP数字分身」与 Agent 之间插入**姓名标签**（可多开） |
| 关闭姓名标签 | 悬停出现圆形 `×`，或工作台「关闭本页」；仅关 Tab，不删数据 |
| Specimen Index | 当前聚焦某姓名标签时显示该 HCP 缩写；列表 / Agent / 新增向导为「—」 |

洞察与一人一策**不再**作为顶栏全局 Tab。

## 2. 分身工作台（Twin Workspace）

| 元素 | 规范 |
|------|------|
| 子 Tab | **HCP资料** · **HCP洞察** · **一人一策** |
| 右侧操作 | **修改** · **删除** · **关闭本页**（删除需确认并落库移除） |
| 智能体情报构建 | 仅 **HCP资料**常驻区；未构建「尚无情报」+「构建情报」；已构建 A–E 完成态 +「重新构建情报」；无「收起进度」 |
| 禁止 | 「返回列表」「返回{姓名}数字分身」条（关页用顶栏 `×` / 关闭本页） |

路由建议：`/twins` 列表；`/twins/{hcpId}` 资料；`/twins/{hcpId}/insights`；`/twins/{hcpId}/options`；`/agent`。

## 3. 界面语言与 i18n

| 项 | 规范 |
|----|------|
| 默认 locale | `zh-CN`（SSR `<html lang="zh-CN">`；客户端随 persist 覆盖） |
| 切换入口 | 顶栏 **中文 \| English**（`AppShell` → `setLocale`）；刷新后保持 |
| 文案 | UI 壳走 message catalog（`useT()` / `t(locale, key)`）；`zh-CN` 与 `en` key 集合必须一致；业务组件禁止硬编码中英 UI 词 |
| 职业轨迹 | 节点类型（教育/现任/曾任/学会）与常见职衔/机构短语按当前 locale 展示；切换 locale 时重新映射 |
| 叙事双语 | Insights `locales.zh-CN` / `locales.en`；Options run 带 `locale`；生成/翻译只写当前语言桶；UI `pickInsightsNarrative(locale)` |
| 新生成叙事 | 洞察合成 / 一人一策 / Agent 请求携带 `locale`；写入对应语言桶，不覆盖另一语言 |
| 姓名 | 主展示 `name_zh`；有 `name_en` 时次级展示 Given Family（如 `王长希 · Changxi Wang`）；见 F-WEB-047 |
| 非目标 | 不引入 next-intl / URL `[locale]`；不自动翻译已落库 Twin/Insights/Options 正文；不用拼音/LLM 猜权威英文名 |
| 扩展 | 接口保留第三种 locale；本轮仅 `zh-CN` / `en` |
| 数据层 | Twin JSON 可存源语言原文；**展示层**负责本地化，不要求采集器只出中文 |

## 4. 原型同步

- 仓库源：`specs/app/hcp-ui-prototype.canvas.tsx`
- Cursor 侧栏：`canvases/hcp-ui-prototype.canvas.tsx`（改源后需同步）

## 5. 实现落点（Web）

| 能力 | 路径 |
|------|------|
| 顶栏壳 / 多开 Tab | `apps/web/src/components/AppShell.tsx` |
| 打开分身会话 | `apps/web/src/store/hcp-context.ts`（`openTwins`） |
| 分身工作台布局 | `apps/web/src/app/twins/[hcpId]/layout.tsx` |
| HCP资料 | `apps/web/src/app/twins/[hcpId]/page.tsx` |
| 职业轨迹展示 | `apps/web/src/components/CareerTimeline.tsx` + `apps/web/src/i18n/` |
| locale / catalog | `apps/web/src/store/hcp-context.ts` · `apps/web/src/i18n/`（`useT`、`LocaleLangSync`、`messages/*`） |
| 洞察 / 一人一策 | `apps/web/src/app/twins/[hcpId]/insights` · `options` |
