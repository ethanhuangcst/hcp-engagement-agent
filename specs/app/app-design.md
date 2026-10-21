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
| 默认 locale | `zh-CN`（与 `<html lang>` 一致） |
| 文案 | UI 字符串走 message catalog（`t(key)`），禁止业务组件硬编码散落英文 UI 词 |
| 职业轨迹 | 节点类型（教育/现任/曾任/学会）与常见职衔/机构短语按当前 locale 展示；切换 locale 时重新映射 |
| 扩展 | 新增 `en` 等 catalog 即可切换；专有名词无译时保留原文并仍可读 |
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
| 洞察 / 一人一策 | `apps/web/src/app/twins/[hcpId]/insights` · `options` |

## 6. 确认页科室来源标注、预灌映射预览与入库科室闸门（MCP2-09 / DEF-005；MCP2-10 / DEF-006，D2）

| 元素 | 规范 |
|------|------|
| 候选卡片科室 | 科室旁展示来源标注（「来自调用方输入提示，未经数据源核实」，数据来自 `department_provenance`）；不当作已核实身份强调展示 |
| mismatch 对照 | 候选带 `department_mismatch` 时展示两侧专科键（输入侧 / 数据源侧），供确认者对照判断；不阻塞选择；确认侧由勾选闸门承接（下行） |
| 映射预览 | 确认保存响应含 `specialty_preview` 时展示「科室 → 将预灌专科」映射列表；与实际预灌同源（`add_hcp` 返回体） |
| 跳过提示 | `matched: false` 行展示「无法映射到受控专科，预灌将跳过」；不静默空白（MCP2-10 后科室行以入库科室为输入恒 matched，此形态仅见于非科室行） |
| 将入库科室（只读） | 确认页科室字段恒显示将入库科室：选中记录 `department_signal.specialty` 的标准中文名（如 nephrology → 肾内科）；字段只读，页面无科室编辑入口；查询表单科室仅作检索提示 |
| mismatch 勾选闸门 | 候选带 `department_mismatch` 时保存前须勾选「已人工核对科室」；未勾选提交返回 `department_confirmation_required`，页面态与勾选项不丢失、库不写；勾选后 BFF 带 `confirm_department_checked` 重提，放行仍取信号侧 |
| 无信号阻断 | 候选无 `department_signal.specialty` 时保存被 `DEPARTMENT_SIGNAL_MISSING` 阻断；页面展示阻断提示并引导换检索条件重查或人工核实；不提供「跳过科室继续保存」入口 |
| 文案 | 全部走 i18n message catalog（§3、F-WEB-046），禁止组件硬编码；闸门与阻断提示新增键随 feature-12 一并入库（en / zh-CN） |

**科室不可编辑为硬规则**：查询表单科室只影响检索召回，不进入确认页可编辑区，也不随保存提交；入库科室唯一来源是选中记录的信号专科（[mcp2-design §13.6](../mcp2.0/mcp2-design.md)）。

实现落点：确认向导组件（`apps/web/src/app/twins` 新增/确认流程）与 BFF `/api/twins/confirm` 响应透传；规格见 [app-function-spec F-WEB-047](./app-function-spec.md)、故事见 [app-stories US-WEB-004 增补场景](./app-stories.md)、上游契约见 [mcp2-design §13](../mcp2.0/mcp2-design.md) 与 [§13.6](../mcp2.0/mcp2-design.md)。
