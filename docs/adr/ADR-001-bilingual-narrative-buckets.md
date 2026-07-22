# ADR-001: Insights / Options 叙事双语分桶

## 状态
已采纳

## 背景
界面支持 `zh-CN` / `en` 切换后，若业务叙事（一句话洞察、兴趣、机会、证据标签、一人一策）只存一份字段，则英文生成会覆盖中文；切回中文界面仍显示英文。曾考虑「切换时整库翻译覆盖」或依赖 next-intl 仅做壳文案。

## 决策
库内对叙事采用**按 locale 分桶**并存：

- Insights：`locales["zh-CN"]` / `locales.en`；顶层字段保留为兼容层。
- Options：`EngagementOptionsRun.locale`；`getLatestEngagementOptions(hcpId, locale)` 按语言隔离 latest。
- 科研主题：源 `themes` + 可选 `themes_i18n`。
- 生成 / 修订 / `translate:en` **只写当前语言桶**，禁止覆盖另一语言。
- UI 用 `pickInsightsNarrative` / `pickResearchThemes`；壳文案仍走自定义 catalog（不引入 next-intl / URL locale）。

## 原因
- 分桶保证中英可切换复核，符合销售/医学对照原文的使用方式。
- 「切语言整库覆盖」会丢中文资产，且翻译质量与合规旁注风险高。
- 壳文案与业务正文生命周期不同：壳可静态 catalog；正文随 Twin/LLM 演进，须可版本化存储。

## 后果
- 存量需跑 `npm run translate:en -w @hca/hcp-engagement-agent` 填 en 桶。
- 列表摘要须按 locale 取 `doing_now_by_locale`，不能只读顶层。
- 医院/科室本轮不做音译（见 ADR-002 非目标对齐）。
- 实现细节见 `knowledge/hcp-twin-data-entity/bilingual-narrative-and-name-en.md`。

## 日期
2026-07-20
