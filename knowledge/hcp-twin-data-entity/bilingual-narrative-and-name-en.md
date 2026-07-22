---
title: 叙事双语分桶与 name_en 拉丁回填
type: ops-lesson
status: active
as_of: 2026-07-20
tags:
  - i18n
  - insights
  - name_en
  - openalex
  - locales
related:
  - specs/app/app-function-spec.md
  - specs/5.hcp-twin-data-dictionary.md
  - specs/6.ui-guideline.md
  - docs/adr/ADR-001-bilingual-narrative-buckets.md
  - docs/adr/ADR-002-latin-name-en-openalex.md
---

# 叙事双语分桶与 name_en 拉丁回填

## 结论（先读）

1. **UI 壳**走 catalog（`zh-CN` / `en`）；**业务叙事**必须库内分桶，不能靠「切语言整库覆盖翻译」。
2. **`name_en` 只认拉丁** Given Family；汉字写入视为脏数据，展示层隐藏、构建层当空回填。
3. OpenAlex 上不少中国作者存在**中文簇 + 拉丁簇**两套 ID；绑中文簇时 `display_name` 无拉丁名，需拼音检索再改绑/回填。
4. **医院 / 科室本轮不音译**（专有名词，避免假英文）。

---

## 1. 叙事双语（Insights / Options）

| 资产 | 分桶方式 | 读 | 写 |
|------|----------|----|----|
| Insights 叙事 | `locales["zh-CN"]` / `locales.en`（doing_now、interest、opportunities、evidence） | `pickInsightsNarrative(locale)` | `synthesizeDoingNow({ locale })` → `withInsightsLocale`；**不碰**另一桶 |
| 顶层 doing_now 等 | 兼容旧行 / 列表摘要 | zh 可回退顶层；en **不**串用中文顶层 | 写入时同步为当前桶 |
| Options | `EngagementOptionsRun.locale` | `getLatestEngagementOptions(hcpId, locale)` | `proposeOptions` / revise 只动该语言 latest |
| 科研主题 | `research.themes` 源 + `themes_i18n` | `pickResearchThemes` | `translate:en` 填 `themes_i18n.en` |

存量填充：

```bash
npm run translate:en -w @hca/hcp-engagement-agent
# 可选：-- --hcpId=hcp_xxx
```

验收：中文合成 → English 再合成 → 切回中文，中文一句话洞察仍在。

---

## 2. name_en 为何「看不见」

常见假象：列表已是 English 壳文案，姓名仍只有中文。

| 原因 | 说明 |
|------|------|
| 库内无拉丁 `name_en` | Tab / `HcpNameHeading` 用 `displayNameEn`；CJK 或与 `name_zh` 相同则返回空 |
| 误存汉字 | 历史把 OpenAlex 中文 `display_name` 写入了 `name_en` |
| 绑错作者簇 | 如王长希曾绑 `A5096108853`（中文、works≈1）；拉丁簇为 `A5101544362`（Changxi Wang） |
| 产品诚实策略 | 无可信拉丁名时**不编造**展示用英文名 |

样例（2026-07-20 已回填）：

| name_zh | name_en | 宜用 OpenAlex |
|---------|---------|---------------|
| 王长希 | Changxi Wang | A5101544362 |
| 葛均波 | Junbo Ge | A5100758728 |

---

## 3. 回填算法（Stage A / translate:en）

1. `effectiveNameEn`：已有且拉丁 → 保留；CJK / 空 → 视为空。
2. 读当前 OpenAlex：`display_name` 拉丁则采用。
3. 否则 `chineseToGivenFamily(name_zh)`（单字姓 + 名拼音 → Given Family，如 `王长希` → `Changxi Wang`）。
4. `authors?search=` 该拉丁串；取拉丁 `display_name` 命中；当前簇非拉丁时可改绑 `openalex`。
5. UI：`王长希 · Changxi Wang`；English Tab 优先拉丁名。

依赖：`pinyin-pro`（`@hca/hcp-twin-mcp`、`@hca/hcp-engagement-agent`）。

---

## 4. 非目标（本轮）

- 医院 / 科室强制英文化或音译  
- next-intl / URL locale  
- 论文题名自动翻译（evidence 来源**类型标签**可英文化）  

---

## 5. 运维检查清单

- [ ] English 下列表可见 `name_zh · name_en`（有拉丁时）  
- [ ] Insights 中英分桶互不覆盖  
- [ ] Options 中英各一套 latest  
- [ ] 一人一策页底引导句走 `options.chat.lead`  
- [ ] 改 domain/agent 后重建 dist 并重启 `npm run dev`（避免 BFF 旧包）  
