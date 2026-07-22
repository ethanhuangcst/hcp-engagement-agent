# ADR-002: name_en 仅拉丁与 OpenAlex 作者簇策略

## 状态
已采纳

## 背景
English 模式下王长希、葛均波等仍只显示中文名。排查发现：`name_en` 被写成汉字；绑定的 OpenAlex 为中文作者簇（`display_name` 无拉丁）；UI 故意隐藏非拉丁 `name_en`。同人常另有拉丁簇（如 Changxi Wang / Junbo Ge），中文检索搜不到拉丁记录。

## 决策
1. **`name_en` 契约**：仅存拉丁 Given Family；含汉字视为无效（展示隐藏、构建/翻译脚本当空）。
2. **不覆盖**已有合法拉丁名；无可信来源时不编造展示用英文名。
3. **回填路径**：优先 OpenAlex 拉丁 `display_name`；若当前簇仅中文，用拼音将 `name_zh` 转为 Given Family 再 `authors?search=`，命中后写入 `name_en`，并可改绑到拉丁簇。
4. **医院 / 科室**：本轮不音译、不强制英文化。

## 原因
- 把汉字当 `name_en` 会导致「王长希 · 王长希」与假英文化。
- OpenAlex 中文簇与拉丁簇并存是数据现实，不能假设单一 ID 的 `display_name` 永远拉丁。
- 拼音检索是启发式消歧辅助，仍以 OpenAlex 命中的拉丁 `display_name` 为准，而非直接把拼音当最终姓名展示（展示用命中结果）。

## 后果
- 依赖 `pinyin-pro`（MCP Stage A 与 `translate:en`）。
- 复姓 / 多音字可能误检索，需人工编辑页校正。
- ~~改绑 OpenAlex 可能改变后续文献灌库集合，应在构建日志可审计。~~ **部分取代**：见 [ADR-004](./ADR-004-multi-openalex-ids.md)——多簇并存时旧 ID 进入 `openalex_aliases`，不再静默丢弃；主/别名集合变更须可审计。
- 运维课见 `knowledge/hcp-twin-data-entity/bilingual-narrative-and-name-en.md`。

## 日期
2026-07-20
