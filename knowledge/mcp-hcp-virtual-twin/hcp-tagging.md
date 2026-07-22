# HCP 打标（Tagging）

> as_of：2026-07-16  
> 用途：`hcp-twin-mcp` 在身份锁定后为 Twin 写入可控标签；UI「数字分身」列表与详情用对比底色展示。  
> 相关：[`hcp-twin-attributes.md`](./hcp-twin-attributes.md)、[`../../specs/5.hcp-twin-data-dictionary.md`](../../specs/5.hcp-twin-data-dictionary.md) §3.5

---

## 1. 原则

| 做 | 不做 |
|----|------|
| 按**公开可验证**的学术/行政影响力与角色打标 | 按处方量、进院潜力、统方结果打标 |
| 标签少而稳定（受控词表） | 自由文本标签刷屏、营销口号式标签 |
| 主标 `hcp_tier` 唯一；辅标 `role_tags[]` 可多选 | 多个互相矛盾的「全国第一人」级主标 |
| 标明 `tag_confidence` 与 `as_of` | 把推断标成事实 |

冲突时取 **cn-hcp-compliance 更严**：行政/政策向辅标优先于促销语境。

---

## 2. 主标：`hcp_tier`（级别）

| 值 | 中文 UI | 判定要点（公开证据） | Engagement 默认倾向 |
|----|---------|----------------------|---------------------|
| `T1` | Tier 1 | 院士 / 全国主委级学会领导 / 国家级质控或公认全国顶尖学科带头人 | MSL / 医学事务优先；慎代表促销 |
| `T2` | Tier 2 | 大型三甲中心/科室主任、区域主委、全国常委或亚专业高影响力 KME | 区域学术 + 合规代表拜访可组合 |
| `T3` | Tier 3 | 机构内骨干、专科高年资、地方学会委员等（非全国顶尖） | 一线教育、科室会、企微内容 |
| `unclassified` | 未分级 | 证据不足 | 先消歧与补源，不假设级别 |

**朱同玉样例：** 公开职务含医学院副院长、全国影响力移植学科带头人、质控中心主任 → 主标倾向 `T1`（须标 `confidence`；MCP live 复核）。

---

## 3. 辅标：`role_tags[]`（角色）

与 Profile `role_labels` **同构取值**（见数据字典 §12.4），写入 `tags.role_tags` 供 UI 着色展示；业务逻辑仍以 `profile.role_labels` 为准。

| 值 | UI 文案 | 底色语义（实现映射到 CSS 变量） |
|----|---------|--------------------------------|
| `kol` | KOL | `--hca-accent` 实心底 + 反白字 |
| `kme` | KME | `--hca-accent-soft` 底 + ink 字 |
| `administrator` | 行政 | `--hca-warn` 浅底（低饱和）+ ink |
| `policy_voice` | 政策发声 | 与行政同系，边框虚线以示分桶 |
| `frontline` | 一线 | `--hca-line` 浅底 |
| `pharmacist` / `nurse` | 药师 / 护理 | 同一线系 |

主标 `hcp_tier` UI：

| 值 | 底色 |
|----|------|
| `T1` | `--hca-ink` 底 + 白字（最高对比） |
| `T2` | `--hca-accent` 底 + 白字 |
| `T3` | `--hca-accent-soft` 底 + ink |
| `unclassified` | 透明 + `--hca-line` 虚线边 + muted 字 |

---

## 4. MCP 行为（简单 tagging）

### 4.1 Tool / 阶段

在 `resolve_hcp_identity` 成功或 `build_twin` Stage A 末：

1. 汇总公开证据：学会任职层级、行政职务、医院等级、影响范围叙述  
2. 规则打标（P0，可解释）→ 写入 `profile.tags`  
3. 可选：LLM 建议标，但必须附 `evidence_refs`；与规则冲突时 **规则优先**

### 4.2 输出形状

```json
{
  "tags": {
    "hcp_tier": "T1",
    "role_tags": ["kol", "kme", "administrator", "policy_voice"],
    "tag_confidence": "medium",
    "tag_as_of": "2026-07-16",
    "tag_method": "rule",
    "evidence_refs": ["profile.admin_roles", "profile.influence_scope"]
  }
}
```

### 4.3 刷新

- 职业轨迹季度刷新时重算 `hcp_tier` / `role_tags`  
- 用户可在「修改分身」中覆盖主标（须记 `tag_method: user_override`）

---

## 5. UI 展示规则

- **数字分身列表**：每行姓名旁展示主标 + 最多 3 个辅标；超出折叠为「+N」  
- **分身详情**：标签置于姓名下方、一句话洞察上方  
- 禁止彩虹多色；仅用上表语义底色，保持性冷淡对比度  
- 标签是**信息**，不是装饰：不放 emoji、不闪烁

---

## 6. 证据边界

| 类型 | 内容 |
|------|------|
| 有来源 | cn-hcp-pro Tier 定义；数据字典 §16 Tier1/Tier2；role_labels 枚举 |
| 推断 | 具体 HCP 的 tier 归属在证据不足时标 `unclassified` 或 medium confidence |
| 建议 | MCP 先规则后可选 LLM；UI 只用受控词表着色 |
