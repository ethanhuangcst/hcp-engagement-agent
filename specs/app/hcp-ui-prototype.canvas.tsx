import {
  Button,
  Code,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Link,
  Row,
  Spacer,
  Stack,
  Stat,
  Table,
  Text,
  TextArea,
  TextInput,
  useCanvasState,
  useHostTheme,
} from "cursor/canvas";

type PageId = "twin" | "insights" | "options" | "agent";
type TwinView =
  | "list"
  | "detail"
  | "edit"
  | "create"
  | "candidates"
  | "confirm"
  | "building";

type GateResult = "idle" | "pass" | "conditional" | "reject";

const BUILD_STAGES = ["身份锁定", "职业轨迹", "科研动向", "一句话洞察"] as const;

const NAV: { id: PageId; label: string }[] = [
  { id: "twin", label: "数字分身" },
  { id: "insights", label: "HCP洞察" },
  { id: "options", label: "一人一策" },
  { id: "agent", label: "HCP Engagement Agent" },
];

const INSIGHT_ONE_LINER =
  "肾移植临床与质控管理并行；公开叙事强调噬菌体、BK 病毒及 AI+移植";

type AuthorIds = {
  orcid: string | null;
  pubmed_author: string | null;
  google_scholar: string | null;
  openalex: string | null;
  scopus_author_id: string | null;
  cnki_scholar: string | null;
};

type TwinRow = {
  id: string;
  name: string;
  hospital: string;
  dept: string;
  abbrev: string;
  tier: "T1" | "T2" | "T3";
  roles: string[];
  insight: string;
  asOf: string;
  authorIds: AuthorIds;
};

type HcpCandidate = {
  candidateId: string;
  name: string;
  nameEn: string;
  hospital: string;
  dept: string;
  title: string;
  tier: "T1" | "T2" | "T3";
  roles: string[];
  insight: string;
  authorIds: AuthorIds;
  matchNote: string;
  confidence: "high" | "medium" | "low";
};

function mockSearchHcp(name: string, hospital: string, dept: string): HcpCandidate[] {
  const trimmed = name.trim();
  if (!trimmed || trimmed.includes("无此人") || trimmed.includes("查无")) {
    return [];
  }
  const q = `${name}${hospital}${dept}`;
  if (q.includes("朱") || q.includes("中山")) {
    return [
      {
        candidateId: "c-zhu-zs",
        name: "朱同玉",
        nameEn: "Tongyu Zhu",
        hospital: "复旦大学附属中山医院",
        dept: "肾脏移植科 / 泌尿外科",
        title: "主任医师 / 教授",
        tier: "T1",
        roles: ["KOL", "KME", "行政", "政策发声"],
        insight: INSIGHT_ONE_LINER,
        authorIds: {
          orcid: null,
          pubmed_author: null,
          google_scholar: "Yby_S-sAAAAJ",
          openalex: null,
          scopus_author_id: null,
          cnki_scholar: null,
        },
        matchNote: "医院专家页 + Scholar · high",
        confidence: "high",
      },
      {
        candidateId: "c-zhu-other",
        name: "朱同玉",
        nameEn: "Tongyu Zhu",
        hospital: "其他机构（同名待核）",
        dept: "外科",
        title: "副主任医师",
        tier: "T3",
        roles: ["一线"],
        insight: "证据不足，勿与中山肾移植朱同玉合并",
        authorIds: {
          orcid: "0000-0009-9999-0000",
          pubmed_author: null,
          google_scholar: null,
          openalex: null,
          scopus_author_id: null,
          cnki_scholar: null,
        },
        matchNote: "仅姓名命中 · low",
        confidence: "low",
      },
    ];
  }
  return [
    {
      candidateId: "c-generic-1",
      name: name || "查询姓名",
      nameEn: "—",
      hospital: hospital || "待确认医院",
      dept: dept || "待确认科室",
      title: "待确认职称",
      tier: "T2",
      roles: ["KME"],
      insight: "MCP 已回填公开页要点；请核对文献检索号后确认",
      authorIds: {
        orcid: "0000-0001-2345-6789",
        pubmed_author: "1122334",
        google_scholar: "AbCdEfGhIjK",
        openalex: "A5098765432",
        scopus_author_id: null,
        cnki_scholar: null,
      },
      matchNote: "模拟检索命中 · medium",
      confidence: "medium",
    },
    {
      candidateId: "c-generic-2",
      name: name || "查询姓名",
      nameEn: "—",
      hospital: "同名候选医院 B",
      dept: dept || "待确认科室",
      title: "主治医师",
      tier: "T3",
      roles: ["一线"],
      insight: "次优候选，文献号不同",
      authorIds: {
        orcid: null,
        pubmed_author: null,
        google_scholar: "XyZ98765432",
        openalex: null,
        scopus_author_id: "99887766",
        cnki_scholar: null,
      },
      matchNote: "同名异院 · 请人工消歧",
      confidence: "low",
    },
  ];
}

function candidateToTwin(c: HcpCandidate, id: string): TwinRow {
  return normalizeTwin({
    id,
    name: c.name,
    hospital: c.hospital,
    dept: c.dept,
    abbrev: c.name.slice(0, 1) || "新",
    tier: c.tier,
    roles: c.roles,
    insight: c.insight,
    asOf: "2026-07-16",
    authorIds: normalizeAuthorIds(c.authorIds),
  });
}

function normalizeAuthorIds(ids?: AuthorIds | null): AuthorIds {
  return {
    orcid: ids?.orcid ?? null,
    pubmed_author: ids?.pubmed_author ?? null,
    google_scholar: ids?.google_scholar ?? null,
    openalex: ids?.openalex ?? null,
    scopus_author_id: ids?.scopus_author_id ?? null,
    cnki_scholar: ids?.cnki_scholar ?? null,
  };
}

function normalizeTwin(t: TwinRow): TwinRow {
  return {
    ...t,
    authorIds: normalizeAuthorIds(t.authorIds),
    roles: t.roles ?? [],
    insight: t.insight ?? "",
    asOf: t.asOf ?? "2026-07-16",
    abbrev: t.abbrev || (t.name ? t.name.slice(0, 1) : "—"),
    tier: t.tier ?? "T3",
  };
}

function isZhuFixture(twin: TwinRow): boolean {
  return twin.id === "zhu" || twin.name.includes("朱同玉");
}

function AuthorIdsPanel({ ids }: { ids?: AuthorIds | null }) {
  const theme = useHostTheme();
  const safe = normalizeAuthorIds(ids);
  const rows: { label: string; value: string | null }[] = [
    { label: "ORCID", value: safe.orcid },
    { label: "PubMed Author", value: safe.pubmed_author },
    { label: "Google Scholar", value: safe.google_scholar },
    { label: "OpenAlex", value: safe.openalex },
    { label: "Scopus", value: safe.scopus_author_id },
    { label: "CNKI", value: safe.cnki_scholar },
  ];
  return (
    <Stack gap={10}>
      <H2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>文献检索号码</H2>
      <Divider />
      <Grid columns="140px 1fr" gap={8}>
        {rows.map((row) => (
          <div key={row.label} style={{ display: "contents" }}>
            <Text tone="tertiary" style={{ fontSize: 12 }}>
              {row.label}
            </Text>
            <Text
              style={{
                fontSize: 12,
                fontFamily: "ui-monospace, monospace",
                color: row.value ? theme.text.primary : theme.text.tertiary,
              }}
            >
              {row.value ?? "待绑定"}
            </Text>
          </div>
        ))}
      </Grid>
    </Stack>
  );
}

const INITIAL_TWINS: TwinRow[] = [
  {
    id: "zhu",
    name: "朱同玉",
    hospital: "复旦大学附属中山医院",
    dept: "肾脏移植科 / 泌尿外科",
    abbrev: "朱",
    tier: "T1",
    roles: ["KOL", "KME", "行政", "政策发声"],
    insight: INSIGHT_ONE_LINER,
    asOf: "2026-07-16",
    authorIds: {
      orcid: null,
      pubmed_author: null,
      google_scholar: "Yby_S-sAAAAJ",
      openalex: null,
      scopus_author_id: null,
      cnki_scholar: null,
    },
  },
  {
    id: "xue",
    name: "薛武军",
    hospital: "西安交通大学第一附属医院",
    dept: "肾脏病医院 / 肾移植",
    abbrev: "薛",
    tier: "T1",
    roles: ["KOL", "KME", "行政"],
    insight: "肾移植组织配型与免疫抑制路径并重；质控与学科建设叙事突出",
    asOf: "2026-07-16",
    authorIds: {
      orcid: "0000-0002-1111-2222",
      pubmed_author: null,
      google_scholar: null,
      openalex: "A5012345678",
      scopus_author_id: "56012345678",
      cnki_scholar: null,
    },
  },
  {
    id: "lin",
    name: "林涛",
    hospital: "四川大学华西医院",
    dept: "泌尿外科 / 肾移植",
    abbrev: "林",
    tier: "T2",
    roles: ["KOL", "KME"],
    insight: "活体肾移植与指南规范并进；区域学术影响力强于全国学术发声",
    asOf: "2026-07-16",
    authorIds: {
      orcid: "0000-0003-3333-4444",
      pubmed_author: "9876543",
      google_scholar: null,
      openalex: null,
      scopus_author_id: null,
      cnki_scholar: null,
    },
  },
];

const CAREER = [
  { year: "现任", role: "复旦上海医学院副院长", org: "复旦大学上海医学院" },
  { year: "现任", role: "肾移植学科带头人", org: "复旦大学附属中山医院" },
  { year: "现任", role: "上海市器官移植重点实验室主任", org: "上海市器官移植重点实验室" },
  { year: "曾任", role: "执行院长", org: "中山医院厦门医院（待消歧）" },
  { year: "1994", role: "外科学博士", org: "上海医科大学" },
];

const DIRECTIONS = [
  {
    title: "噬菌体抗耐药感染",
    achievements: [
      { kind: "论文", text: "噬菌体治疗耐药感染相关公开研究（待 PMID 绑定）", href: null },
      { kind: "认可", text: "噬菌体相关研究所所长（公开任职）", href: "https://www.transplantation.com.cn/" },
    ],
  },
  {
    title: "肾移植免疫与排斥",
    achievements: [
      { kind: "出版", text: "科室页宣称 SCI 280+（须标来源，降权展示）", href: "https://www.transplantation.com.cn/zh_CN/专家介绍/" },
      { kind: "荣誉", text: "肾移植学科带头人 / 质控相关公开职务", href: "https://imi.fudan.edu.cn/info/1216/1053.htm" },
    ],
  },
  {
    title: "AI 与移植/科室管理",
    achievements: [
      { kind: "活动", text: "2025 肾移植 AI 前沿论坛（主席）", href: "https://www.transplantation.com.cn/" },
      { kind: "认可", text: "公开叙事：可信数据空间 / 智能体边界", href: null },
    ],
  },
  {
    title: "BK 病毒与移植后感染",
    achievements: [
      { kind: "论文", text: "移植后病毒感染主题簇（待灌库补全）", href: null },
    ],
  },
];

type Act = { date: string; place: string; name: string; href: string };

const HEAT: { earlier: Act[]; d90: Act[]; d60: Act[]; d30: Act[] } = {
  earlier: [
    {
      date: "2025-06",
      place: "上海",
      name: "肾移植 AI 前沿论坛",
      href: "https://www.transplantation.com.cn/",
    },
  ],
  d90: [],
  d60: [],
  d30: [],
};

const EVIDENCE = [
  {
    name: "医院专家介绍",
    conf: "high",
    asOf: "2026-07-16",
    href: "https://www.transplantation.com.cn/zh_CN/专家介绍/",
  },
  {
    name: "医学院任职页",
    conf: "high",
    asOf: "2026-07-16",
    href: "https://imi.fudan.edu.cn/info/1216/1053.htm",
  },
  {
    name: "Scholar 作者页",
    conf: "medium",
    asOf: "2026-07-16",
    href: "https://scholar.google.com/citations?user=Yby_S-sAAAAJ",
  },
];

const OPTIONS = [
  {
    id: "o1",
    label: "方案 1",
    priority: "P0",
    action: "MSL 访前：噬菌体治疗证据缺口与路径边界 briefing",
    owner: "MSL",
    channel: "msl_visit",
    topic: "噬菌体抗耐药感染 / 未满足需求",
    signal: "医生确认可讨论的证据问题清单；记录勿延伸至处方偏好",
    compliance: "政策/媒体议题勿用促销话术；输出不替代 MLR",
    academicRefs: "research.themes.phage_therapy",
    complianceRefs: "RDPAC · 学术交流边界",
  },
  {
    id: "o2",
    label: "方案 2",
    priority: "P0",
    action: "科室会提案：BK 病毒移植后感染病例讨论（机构同意后）",
    owner: "医学事务 + 代表备案",
    channel: "dept_meeting",
    topic: "BK 病毒与移植后感染",
    signal: "获得院内科室会书面同意；参会名单与议题归档",
    compliance: "院内学术活动须机构同意 + 代表备案",
    academicRefs: "research.themes.bk_virus",
    complianceRefs: "医药代表管理办法 · 医院同意",
  },
  {
    id: "o3",
    label: "方案 3",
    priority: "P1",
    action: "会后跟进：肾移植 AI 前沿论坛要点 → 合规边界对话",
    owner: "MSL",
    channel: "post_conference_followup",
    topic: "AI 在移植与科室管理的医学边界",
    signal: "确认兴趣点，不承诺产品能力",
    compliance: "数字化工具对话保持医学边界",
    academicRefs: "activity.events.evt-2025-06-ai-forum",
    complianceRefs: "广告法 · 处方药宣传边界",
  },
  {
    id: "o4",
    label: "方案 4",
    priority: "P2",
    action: "重点实验室方向摸底：转化合作可行性（非促销）",
    owner: "医学事务 / 对外合作",
    channel: "msl_visit",
    topic: "研究或转化合作假设",
    signal: "明确是否开放联合课题讨论窗口",
    compliance: "不假设处方偏好、进院意愿或特定产品合作意向",
    academicRefs: "research.lab_affiliations",
    complianceRefs: "PIPL · 交流记录最小化",
  },
];

type ChatMsg = { role: "user" | "assistant"; text: string };
type ChatSession = { id: string; title: string; messages: ChatMsg[] };

function TagChip({
  label,
  variant,
}: {
  label: string;
  variant: "tier1" | "tier2" | "tier3" | "kol" | "soft" | "warn";
}) {
  const theme = useHostTheme();
  const styles: Record<string, { bg: string; color: string; border?: string }> = {
    tier1: { bg: theme.text.primary, color: theme.bg.elevated },
    tier2: { bg: theme.accent.primary, color: theme.text.onAccent },
    tier3: { bg: theme.fill.tertiary, color: theme.text.primary },
    kol: { bg: theme.accent.primary, color: theme.text.onAccent },
    soft: { bg: theme.fill.secondary, color: theme.text.primary },
    warn: {
      bg: theme.fill.tertiary,
      color: theme.text.primary,
      border: `1px dashed ${theme.stroke.secondary}`,
    },
  };
  const s = styles[variant];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.02em",
        background: s.bg,
        color: s.color,
        border: s.border ?? "none",
        borderRadius: 2,
      }}
    >
      {label}
    </span>
  );
}

/** 子页返回导航：secondary + 箭头，独立条，避免 ghost 淹没在操作区 */
function BackNavBar({
  label,
  onBack,
  actions,
}: {
  label: string;
  onBack: () => void;
  actions?: JSX.Element | null;
}) {
  const theme = useHostTheme();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        padding: "10px 12px",
        background: theme.fill.secondary,
        border: `1px solid ${theme.stroke.tertiary}`,
        borderLeft: `3px solid ${theme.accent.primary}`,
        borderRadius: 4,
      }}
    >
      <Button variant="secondary" onClick={onBack}>
        ← {label}
      </Button>
      {actions ? <Row gap={8}>{actions}</Row> : null}
    </div>
  );
}

function TwinTags({ tier, roles }: { tier: string; roles: string[] }) {
  const tierVariant =
    tier === "T1" ? "tier1" : tier === "T2" ? "tier2" : "tier3";
  const roleVariant = (r: string) => {
    if (r === "KOL") return "kol" as const;
    if (r === "行政" || r === "政策发声") return "warn" as const;
    return "soft" as const;
  };
  return (
    <Row gap={6} wrap align="center">
      <TagChip label={tier} variant={tierVariant} />
      {roles.slice(0, 3).map((r) => (
        <div key={r}>
          <TagChip label={r} variant={roleVariant(r)} />
        </div>
      ))}
    </Row>
  );
}

function SpecimenIndex({ abbrev }: { abbrev: string }) {
  const theme = useHostTheme();
  return (
    <div
      style={{
        width: 32,
        flexShrink: 0,
        background: theme.fill.secondary,
        borderRight: `1px solid ${theme.stroke.tertiary}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 24,
        gap: 12,
        minHeight: "100%",
      }}
    >
      <Text
        weight="semibold"
        style={{
          writingMode: "vertical-rl",
          letterSpacing: "0.12em",
          fontSize: 13,
          color: theme.text.primary,
        }}
      >
        {abbrev}
      </Text>
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          border: `1px solid ${theme.text.primary}`,
          background: "transparent",
        }}
      />
    </div>
  );
}

function CareerSpine() {
  const theme = useHostTheme();
  return (
    <Stack gap={0}>
      {CAREER.map((item, i) => (
        <div
          key={`${item.year}-${item.role}`}
          style={{ display: "flex", gap: 14, minHeight: 52 }}
        >
          <div style={{ width: 48, flexShrink: 0, textAlign: "right", paddingTop: 2 }}>
            <Text
              style={{
                fontSize: 12,
                fontFamily: "ui-monospace, monospace",
                color: theme.text.tertiary,
              }}
            >
              {item.year}
            </Text>
          </div>
          <div
            style={{
              width: 12,
              flexShrink: 0,
              position: "relative",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: i === CAREER.length - 1 ? 24 : 0,
                width: 1,
                background: theme.accent.primary,
                opacity: 0.55,
              }}
            />
            <div
              style={{
                width: 6,
                height: 6,
                marginTop: 5,
                borderRadius: 999,
                border: `1px solid ${theme.accent.primary}`,
                background: theme.bg.elevated,
                zIndex: 1,
              }}
            />
          </div>
          <Stack gap={2} style={{ paddingBottom: 16, flex: 1 }}>
            <Text weight="medium" style={{ fontSize: 13 }}>
              {item.role}
            </Text>
            <Text tone="secondary" style={{ fontSize: 12 }}>
              {item.org}
            </Text>
          </Stack>
        </div>
      ))}
    </Stack>
  );
}

function ActCell({ items }: { items: Act[] }) {
  const theme = useHostTheme();
  if (items.length === 0) {
    return (
      <Text tone="tertiary" style={{ fontSize: 12 }}>
        无公开证据
      </Text>
    );
  }
  return (
    <Stack gap={8}>
      {items.map((a) => (
        <div key={`${a.date}-${a.name}`}>
          <Text
            style={{
              fontSize: 11,
              fontFamily: "ui-monospace, monospace",
              color: theme.text.tertiary,
            }}
          >
            {a.date} · {a.place}
          </Text>
          <div>
            <Link href={a.href}>{a.name}</Link>
          </div>
        </div>
      ))}
    </Stack>
  );
}

function AppChrome({
  page,
  onPage,
  abbrev,
  showHcpTabs,
  children,
}: {
  page: PageId;
  onPage: (p: PageId) => void;
  abbrev: string;
  showHcpTabs: boolean;
  children?: unknown;
}) {
  const theme = useHostTheme();
  const visibleNav = NAV.filter((s) => {
    if (s.id === "insights" || s.id === "options") return showHcpTabs;
    return true;
  });
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100%",
        background: theme.bg.editor,
        color: theme.text.primary,
      }}
    >
      <SpecimenIndex abbrev={abbrev} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            borderBottom: `1px solid ${theme.stroke.tertiary}`,
            padding: "12px 24px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: theme.bg.chrome,
            flexWrap: "wrap",
          }}
        >
          <Text weight="medium" style={{ fontSize: 13, letterSpacing: "0.02em" }}>
            hcp engagement
          </Text>
          <Text tone="tertiary" style={{ fontSize: 12 }}>
            ·
          </Text>
          <Row gap={4} align="center" wrap>
            {visibleNav.map((s) => (
              <div key={s.id}>
                <Button
                  variant={s.id === page ? "primary" : "ghost"}
                  onClick={() => onPage(s.id)}
                >
                  {s.label}
                </Button>
              </div>
            ))}
          </Row>
          <Spacer />
          <Text tone="tertiary" style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}>
            prototype · 6.ui-guideline
          </Text>
        </div>
        <div
          style={{
            padding: "24px 28px 40px",
            maxWidth: page === "agent" ? 1280 : 1120,
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          {children as never}
        </div>
      </div>
    </div>
  );
}

function TwinListPage({
  twins,
  onOpen,
  onEdit,
  onDelete,
  onAdd,
}: {
  twins: TwinRow[];
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  const theme = useHostTheme();
  const [pendingDeleteId, setPendingDeleteId] = useCanvasState<string | null>(
    "pending-delete-id",
    null,
  );
  const pending = pendingDeleteId
    ? twins.find((t) => t.id === pendingDeleteId)
    : null;

  return (
    <Stack gap={20}>
      <Row align="end" justify="space-between" wrap gap={12}>
        <Stack gap={6}>
          <Text tone="secondary" style={{ fontSize: 12 }}>
            数字分身
          </Text>
          <H1 style={{ fontSize: 28, fontWeight: 500, margin: 0 }}>
            HCP 数字分身列表
          </H1>
          <Text tone="secondary" style={{ fontSize: 14 }}>
            共 {twins.length} 位医生分身 · 每一行是一位独立 HCP
          </Text>
        </Stack>
        <Button variant="primary" onClick={onAdd}>
          新增数字分身
        </Button>
      </Row>

      {pending ? (
        <div
          style={{
            border: `1px solid ${theme.stroke.secondary}`,
            borderRadius: 4,
            padding: "12px 16px",
            background: theme.bg.elevated,
          }}
        >
          <Stack gap={10}>
            <Text style={{ fontSize: 14 }}>
              确认删除「{pending.name}」？删除后不可从列表恢复，洞察与一人一策将收回。
            </Text>
            <Row gap={8}>
              <Button
                variant="primary"
                onClick={() => {
                  onDelete(pending.id);
                  setPendingDeleteId(null);
                }}
              >
                确认删除
              </Button>
              <Button variant="ghost" onClick={() => setPendingDeleteId(null)}>
                取消
              </Button>
            </Row>
          </Stack>
        </div>
      ) : null}

      <div
        style={{
          border: `1px solid ${theme.stroke.tertiary}`,
          borderRadius: 4,
          overflow: "hidden",
          background: theme.bg.elevated,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "48px 1fr 200px 100px",
            gap: 12,
            padding: "10px 16px",
            borderBottom: `1px solid ${theme.stroke.tertiary}`,
            background: theme.fill.secondary,
          }}
        >
          <Text
            tone="tertiary"
            style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}
          >
            #
          </Text>
          <Text tone="tertiary" style={{ fontSize: 11 }}>
            医生 / 机构 / 一句话洞察
          </Text>
          <Text tone="tertiary" style={{ fontSize: 11 }}>
            级别标签
          </Text>
          <Text tone="tertiary" style={{ fontSize: 11 }}>
            操作
          </Text>
        </div>

        {twins.length === 0 ? (
          <div style={{ padding: 24 }}>
            <Text tone="secondary">尚无分身。点击「新增数字分身」开始构建。</Text>
          </div>
        ) : (
          twins.map((t, i) => (
            <div
              key={t.id}
              style={{
                display: "grid",
                gridTemplateColumns: "48px 1fr 200px 100px",
                gap: 12,
                padding: "16px",
                borderBottom:
                  i < twins.length - 1
                    ? `1px solid ${theme.stroke.tertiary}`
                    : "none",
                borderLeft: `3px solid ${theme.accent.primary}`,
                alignItems: "start",
              }}
            >
              <Text
                weight="semibold"
                style={{
                  fontSize: 18,
                  fontFamily: "ui-monospace, monospace",
                  color: theme.text.tertiary,
                  lineHeight: 1.2,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </Text>
              <Stack gap={6}>
                <Row gap={8} align="start" wrap>
                  <Text weight="semibold" style={{ fontSize: 17 }}>
                    {t.name}
                  </Text>
                  <Text
                    tone="tertiary"
                    style={{
                      fontSize: 11,
                      fontFamily: "ui-monospace, monospace",
                    }}
                  >
                    hcp:{t.id}
                  </Text>
                </Row>
                <Text tone="secondary" style={{ fontSize: 13 }}>
                  {t.hospital}
                </Text>
                <Text tone="tertiary" style={{ fontSize: 12 }}>
                  {t.dept}
                </Text>
                <Text style={{ fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>
                  {t.insight}
                </Text>
                <Text
                  tone="tertiary"
                  style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}
                >
                  as_of {t.asOf}
                </Text>
              </Stack>
              <TwinTags tier={t.tier} roles={t.roles} />
              <Stack gap={6}>
                <Button variant="primary" onClick={() => onOpen(t.id)}>
                  打开
                </Button>
                <Button variant="secondary" onClick={() => onEdit(t.id)}>
                  修改
                </Button>
                <Button variant="ghost" onClick={() => setPendingDeleteId(t.id)}>
                  删除
                </Button>
              </Stack>
            </div>
          ))
        )}
      </div>
    </Stack>
  );
}

function TwinDetailPage({
  twin,
  onBack,
  onEdit,
  mode = "saved",
  onConfirmSave,
}: {
  twin: TwinRow;
  onBack: () => void;
  onEdit?: () => void;
  mode?: "saved" | "confirm";
  onConfirmSave?: () => void;
}) {
  const theme = useHostTheme();
  const backLabel = mode === "confirm" ? "返回候选" : "返回列表";
  return (
    <Stack gap={24}>
      <BackNavBar
        label={backLabel}
        onBack={onBack}
        actions={
          mode === "saved" && onEdit ? (
            <Button variant="secondary" onClick={onEdit}>
              修改
            </Button>
          ) : mode === "confirm" && onConfirmSave ? (
            <Button variant="primary" onClick={onConfirmSave}>
              确认并保存
            </Button>
          ) : null
        }
      />
      {mode === "confirm" ? (
        <Text tone="secondary" style={{ fontSize: 13 }}>
          已根据 hcp-twin-mcp 查询结果生成分身预览。核对 ORCID 等文献号后确认保存。
        </Text>
      ) : null}
      <Stack gap={8}>
        <H1 style={{ fontSize: 28, fontWeight: 500, margin: 0 }}>{twin.name}</H1>
        <TwinTags tier={twin.tier} roles={twin.roles} />
        <Text tone="secondary" style={{ fontSize: 13 }}>
          {twin.hospital} · {twin.dept}
        </Text>
      </Stack>

      <div
        style={{
          border: `1px solid ${theme.stroke.tertiary}`,
          borderRadius: 4,
          padding: "12px 16px",
          background: theme.bg.elevated,
        }}
      >
        <Text tone="tertiary" style={{ fontSize: 12 }}>
          一句话洞察
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 1.55, marginTop: 6 }}>
          {twin.insight}
        </Text>
      </div>

      <AuthorIdsPanel ids={twin.authorIds} />

      <Stack gap={10}>
        <H2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>职业轨迹</H2>
        <Divider />
        <CareerSpine />
      </Stack>

      {mode === "confirm" && onConfirmSave ? (
        <Row gap={8}>
          <Button variant="primary" onClick={onConfirmSave}>
            确认并保存
          </Button>
          <Button variant="secondary" onClick={onBack}>
            ← 返回候选
          </Button>
        </Row>
      ) : null}
    </Stack>
  );
}

function TwinCreatePage({
  onBack,
  onQueried,
}: {
  onBack: () => void;
  onQueried: (name: string, hospital: string, dept: string, candidates: HcpCandidate[]) => void;
}) {
  const theme = useHostTheme();
  const [name, setName] = useCanvasState("create-name", "朱同玉");
  const [hospital, setHospital] = useCanvasState(
    "create-hospital",
    "复旦大学附属中山医院",
  );
  const [dept, setDept] = useCanvasState("create-dept", "肾脏移植科 / 泌尿外科");
  const [querying, setQuerying] = useCanvasState("create-querying", false);

  return (
    <Stack gap={24}>
      <BackNavBar
        label="返回列表"
        onBack={onBack}
        actions={<Text weight="medium">新增数字分身</Text>}
      />
      <Text tone="secondary" style={{ fontSize: 14, maxWidth: 520 }}>
        填写基本信息后查询 HCP。系统调用 hcp-twin-mcp 在后台检索公开记录并回填文献号，供你消歧选择。
      </Text>

      <div
        style={{
          border: `1px solid ${theme.stroke.tertiary}`,
          borderRadius: 4,
          padding: 20,
          background: theme.bg.elevated,
          maxWidth: 480,
        }}
      >
        <Stack gap={14}>
          <Stack gap={4}>
            <Text style={{ fontSize: 12 }} tone="secondary">
              姓名
            </Text>
            <TextInput value={name} onChange={setName} />
          </Stack>
          <Stack gap={4}>
            <Text style={{ fontSize: 12 }} tone="secondary">
              医院
            </Text>
            <TextInput value={hospital} onChange={setHospital} />
          </Stack>
          <Stack gap={4}>
            <Text style={{ fontSize: 12 }} tone="secondary">
              科室
            </Text>
            <TextInput value={dept} onChange={setDept} />
          </Stack>
          <Row gap={8}>
            <Button
              variant="primary"
              disabled={querying}
              onClick={() => {
                setQuerying(true);
                const candidates = mockSearchHcp(name, hospital, dept);
                setQuerying(false);
                onQueried(name, hospital, dept, candidates);
              }}
            >
              {querying ? "查询中…" : "查询 HCP"}
            </Button>
            <Button variant="secondary" onClick={onBack}>
              取消
            </Button>
          </Row>
          <Text tone="tertiary" style={{ fontSize: 12 }}>
            原型模拟 MCP：resolve_hcp_identity → 候选列表（含 ORCID / Scholar / OpenAlex 等）
          </Text>
        </Stack>
      </div>
    </Stack>
  );
}

function TwinCandidatesPage({
  candidates,
  onBack,
  onSelect,
}: {
  candidates: HcpCandidate[];
  onBack: () => void;
  onSelect: (c: HcpCandidate) => void;
}) {
  const theme = useHostTheme();
  return (
    <Stack gap={20}>
      <BackNavBar
        label="返回修改查询"
        onBack={onBack}
        actions={<Text weight="medium">查询结果 · 请选择正确的 HCP</Text>}
      />
      <Text tone="secondary" style={{ fontSize: 13 }}>
        共 {candidates.length} 条候选（hcp-twin-mcp）。核对医院与文献检索号后再选。
      </Text>

      {candidates.length === 0 ? (
        <div
          style={{
            border: `1px solid ${theme.stroke.tertiary}`,
            borderRadius: 4,
            padding: 20,
            background: theme.bg.elevated,
          }}
        >
          <Stack gap={10}>
            <Text style={{ fontSize: 14 }}>
              未找到可信候选。可补充医院官网或 ORCID 链接后重试，或核对姓名与科室拼写。
            </Text>
            <Text tone="tertiary" style={{ fontSize: 12 }}>
              系统未写入分身。提示：姓名填「无此人」可复现本空结果（原型）。
            </Text>
            <Button variant="secondary" onClick={onBack}>
              返回修改查询
            </Button>
          </Stack>
        </div>
      ) : (
      <Stack gap={0}>
        {candidates.map((c, i) => (
          <div
            key={c.candidateId}
            style={{
              borderBottom: `1px solid ${theme.stroke.tertiary}`,
              padding: "16px 14px",
              borderLeft:
                c.confidence === "high"
                  ? `2px solid ${theme.accent.primary}`
                  : `2px solid ${theme.stroke.tertiary}`,
              background:
                c.confidence === "high" ? theme.fill.tertiary : "transparent",
            }}
          >
            <Stack gap={8}>
              <Row gap={8} align="center" wrap>
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: "ui-monospace, monospace",
                    color: theme.text.tertiary,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </Text>
                <Text weight="semibold" style={{ fontSize: 16 }}>
                  {c.name}
                </Text>
                <Text tone="tertiary" style={{ fontSize: 12 }}>
                  {c.nameEn}
                </Text>
                <TwinTags tier={c.tier} roles={c.roles} />
              </Row>
              <Text tone="secondary" style={{ fontSize: 13 }}>
                {c.hospital} · {c.dept} · {c.title}
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 1.5 }}>{c.insight}</Text>
              <AuthorIdsPanel ids={c.authorIds} />
              <Text tone="tertiary" style={{ fontSize: 12 }}>
                {c.matchNote} · confidence {c.confidence}
              </Text>
              <Row gap={8}>
                <Button variant="primary" onClick={() => onSelect(c)}>
                  选择此记录
                </Button>
              </Row>
            </Stack>
          </div>
        ))}
      </Stack>
      )}
    </Stack>
  );
}

function TwinEditPage({
  twin,
  onBack,
  onSave,
}: {
  twin: TwinRow;
  onBack: () => void;
  onSave: (patch: { name: string; hospital: string; dept: string }) => void;
}) {
  const theme = useHostTheme();
  const [name, setName] = useCanvasState("edit-name", twin.name);
  const [hospital, setHospital] = useCanvasState("edit-hospital", twin.hospital);
  const [dept, setDept] = useCanvasState("edit-dept", twin.dept);

  return (
    <Stack gap={24}>
      <BackNavBar
        label="返回列表"
        onBack={onBack}
        actions={<Text weight="medium">修改数字分身</Text>}
      />

      <div
        style={{
          border: `1px solid ${theme.stroke.tertiary}`,
          borderRadius: 4,
          padding: 20,
          background: theme.bg.elevated,
          maxWidth: 480,
        }}
      >
        <Stack gap={14}>
          <Stack gap={4}>
            <Text style={{ fontSize: 12 }} tone="secondary">
              姓名
            </Text>
            <TextInput value={name} onChange={setName} />
          </Stack>
          <Stack gap={4}>
            <Text style={{ fontSize: 12 }} tone="secondary">
              医院
            </Text>
            <TextInput value={hospital} onChange={setHospital} />
          </Stack>
          <Stack gap={4}>
            <Text style={{ fontSize: 12 }} tone="secondary">
              科室
            </Text>
            <TextInput value={dept} onChange={setDept} />
          </Stack>
          <AuthorIdsPanel ids={twin.authorIds} />
          <Row gap={8}>
            <Button
              variant="primary"
              onClick={() => onSave({ name, hospital, dept })}
            >
              保存修改
            </Button>
            <Button variant="secondary" onClick={onBack}>
              取消
            </Button>
          </Row>
        </Stack>
      </div>
    </Stack>
  );
}

function InsightsPage({ twin }: { twin: TwinRow }) {
  const theme = useHostTheme();
  const demo = isZhuFixture(twin);
  const [exportNote, setExportNote] = useCanvasState("insights-export-note", "");

  return (
    <Stack gap={28}>
      <Row align="end" justify="space-between" wrap gap={12}>
        <Stack gap={8}>
          <Text tone="secondary" style={{ fontSize: 12 }}>
            HCP 洞察
          </Text>
          <H1 style={{ fontSize: 28, fontWeight: 500, margin: 0 }}>{twin.name}</H1>
          <TwinTags tier={twin.tier} roles={twin.roles} />
          <Text tone="secondary" style={{ fontSize: 13 }}>
            {twin.hospital} · {twin.dept}
          </Text>
        </Stack>
        <Stack gap={8} style={{ alignItems: "flex-end" }}>
          <Text
            tone="tertiary"
            style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}
          >
            as_of {twin.asOf} · twin_version 1
          </Text>
          <Button
            variant="secondary"
            onClick={() =>
              setExportNote(
                "（原型）导出预览：将隐藏导航，保留表与时间轴 · 正式环境生成 PDF/打印友好页",
              )
            }
          >
            导出
          </Button>
        </Stack>
      </Row>

      {exportNote ? (
        <Text tone="secondary" style={{ fontSize: 13 }}>
          {exportNote}
        </Text>
      ) : null}

      {!demo ? (
        <Text tone="secondary" style={{ fontSize: 13, lineHeight: 1.55 }}>
          当前分身非朱同玉验收样例：下方科研/热力/兴趣为演示骨架，正式环境将按该
          hcpId 的 Twin Insights 渲染。一句话洞察与文献号已绑定本分身。
        </Text>
      ) : null}

      <div
        style={{
          border: `1px solid ${theme.stroke.tertiary}`,
          borderRadius: 4,
          padding: "12px 16px",
          background: theme.bg.elevated,
        }}
      >
        <Text tone="tertiary" style={{ fontSize: 12 }}>
          一句话洞察
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 1.55, marginTop: 6 }}>
          {twin.insight}
        </Text>
        {demo ? (
          <Text
            tone="secondary"
            style={{ fontSize: 13, lineHeight: 1.6, marginTop: 10 }}
          >
            分析：公开身份同时覆盖临床 KOL、实验室主任与医学院行政，Engagement
            须按议题分轨——学术未满足需求走 MSL，路径/质控走医学教育，行政与政策发声勿叠促销话术。近窗公开会务为空，不宜用「高频办会」假设节奏。
          </Text>
        ) : (
          <Text
            tone="secondary"
            style={{ fontSize: 13, lineHeight: 1.6, marginTop: 10 }}
          >
            分析：待 Agent synthesizeDoingNow 按本分身 Insights 生成（原型占位）。
          </Text>
        )}
      </div>

      <AuthorIdsPanel ids={twin.authorIds} />

      <Row gap={32} wrap>
        <Stat value={demo ? "4" : "—"} label="科研方向" />
        <Stat value={demo ? "0" : "—"} label="近 90 日公开会务" />
        <Stat value={twin.tier} label="级别主标" />
      </Row>

      <Stack gap={14}>
        <H2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>科研方向</H2>
        <Divider />
        {demo ? (
          DIRECTIONS.map((d) => (
            <div key={d.title} style={{ paddingBottom: 12 }}>
              <H3 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{d.title}</H3>
              <Stack gap={6} style={{ marginTop: 8 }}>
                {d.achievements.map((a) => (
                  <div key={a.text}>
                    <Row gap={8} align="start">
                      <Text
                        tone="tertiary"
                        style={{ fontSize: 12, width: 36, flexShrink: 0 }}
                      >
                        {a.kind}
                      </Text>
                      {a.href ? (
                        <Link href={a.href}>{a.text}</Link>
                      ) : (
                        <Text style={{ fontSize: 13 }}>{a.text}</Text>
                      )}
                    </Row>
                  </div>
                ))}
              </Stack>
            </div>
          ))
        ) : (
          <Text tone="tertiary" style={{ fontSize: 13 }}>
            待 Twin 科研主题灌入后展示（hcp:{twin.id}）
          </Text>
        )}
      </Stack>

      <Stack gap={10}>
        <H2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>活动热力</H2>
        <Divider />
        <Text tone="tertiary" style={{ fontSize: 12 }}>
          日期 · 地点 · 名称（链接）· 空窗不绘假高峰
        </Text>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr>
                {["更早", "90天", "60天", "30天"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      fontWeight: 500,
                      padding: "10px 12px",
                      borderBottom: `1px solid ${theme.stroke.tertiary}`,
                      color: theme.text.secondary,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {[HEAT.earlier, HEAT.d90, HEAT.d60, HEAT.d30].map((col, i) => (
                  <td
                    key={i}
                    style={{
                      verticalAlign: "top",
                      padding: "12px",
                      borderBottom: `1px solid ${theme.stroke.tertiary}`,
                      minWidth: 140,
                    }}
                  >
                    <ActCell items={col} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Stack>

      <Stack gap={8}>
        <H2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>
          已知近期学术活动
        </H2>
        <Divider />
        <Text style={{ fontSize: 13 }}>
          2025-06 · 上海 ·{" "}
          <Link href="https://www.transplantation.com.cn/">肾移植 AI 前沿论坛</Link>
          {" "}· 主席 · academic
        </Text>
      </Stack>

      <Grid columns="1fr 1fr" gap={28}>
        <Stack gap={10}>
          <H2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>兴趣方向</H2>
          <Divider />
          <Stack gap={12}>
            <Stack gap={4}>
              <Text weight="medium" style={{ fontSize: 13 }}>
                1. 耐药感染与噬菌体治疗（学术主轴）
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 1.55 }}>
                公开叙事与实验室挂靠一致：关心证据缺口、适应路径与未满足临床需求，而非产品比较话术。互动宜深、宜少、宜有文献锚点。
              </Text>
            </Stack>
            <Stack gap={4}>
              <Text weight="medium" style={{ fontSize: 13 }}>
                2. 移植质控与路径规范（管理主轴）
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 1.55 }}>
                质控中心 / 学科带头人角色提示：对标准化随访、感染防控路径、科室能力建设更敏感；内容形态偏指南/路径讨论。
              </Text>
            </Stack>
            <Stack gap={4}>
              <Text weight="medium" style={{ fontSize: 13 }}>
                3. AI 医疗与可信数据（新兴轴，须分桶）
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 1.55 }}>
                论坛主席与公开采访并存：兴趣可能在「工具边界与数据可信」，而非厂商功能清单。与政策/媒体议题分桶，避免当成纯学术兴趣。
              </Text>
            </Stack>
            <Text tone="tertiary" style={{ fontSize: 12, lineHeight: 1.5 }}>
              渠道偏好假设：msl_visit · dept_meeting ·
              post_conference_followup（推断，medium）
            </Text>
            <Text tone="tertiary" style={{ fontSize: 12, lineHeight: 1.5 }}>
              合规旁注：政策/媒体议题勿促销；院内会须机构同意 + 代表备案；输出不替代
              MLR
            </Text>
          </Stack>
        </Stack>
        <Stack gap={10}>
          <H2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>可能的机会</H2>
          <Divider />
          <Stack gap={12}>
            <Stack gap={4}>
              <Text weight="medium" style={{ fontSize: 13 }}>
                机会 A · 科学深聊（P0）
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 1.55 }}>
                噬菌体 / BK
                病毒证据缺口 briefing：成功信号=确认可讨论问题清单，且不延伸至处方偏好。负责人建议
                MSL。
              </Text>
            </Stack>
            <Stack gap={4}>
              <Text weight="medium" style={{ fontSize: 13 }}>
                机会 B · 科室路径教育（P0，程序前置）
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 1.55 }}>
                移植后感染病例讨论：须先拿机构同意与备案代表；适合观念维护阶段，非促销进院。
              </Text>
            </Stack>
            <Stack gap={4}>
              <Text weight="medium" style={{ fontSize: 13 }}>
                机会 C · 会后边界对话（P1）
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 1.55 }}>
                借 2025 AI
                论坛话题跟进「医学边界」：只问兴趣点与合规红线，不承诺产品能力。
              </Text>
            </Stack>
            <Stack gap={4}>
              <Text weight="medium" style={{ fontSize: 13 }}>
                机会 D · 转化合作摸底（P2）
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 1.55 }}>
                重点实验室方向是否开放联合课题：只做窗口探测；禁止假设进院或产品绑定。
              </Text>
            </Stack>
            <Text tone="tertiary" style={{ fontSize: 12 }}>
              confidence medium · 明确不假设：处方偏好、进院意愿、特定产品合作意向
            </Text>
            <Text tone="tertiary" style={{ fontSize: 12 }}>
              suitable_for_promo_dialogue: false（行政/政策角色占比高）
            </Text>
          </Stack>
        </Stack>
      </Grid>

      <Stack gap={10}>
        <H2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>证据与来源</H2>
        <Divider />
        <Table
          headers={["来源", "置信", "as_of"]}
          rows={EVIDENCE.map((e) => [
            <span key={`l-${e.name}`}>
              <Link href={e.href}>{e.name}</Link>
            </span>,
            e.conf,
            <span key={`c-${e.name}`}>
              <Code>{e.asOf}</Code>
            </span>,
          ])}
        />
      </Stack>
    </Stack>
  );
}

function OptionsPage({ twin }: { twin: TwinRow }) {
  const theme = useHostTheme();
  const demo = isZhuFixture(twin);
  const [tab, setTab] = useCanvasState("option-tab", "o1");
  const [miniChat, setMiniChat] = useCanvasState("option-mini-chat", "");
  const [miniLog, setMiniLog] = useCanvasState<ChatMsg[]>("option-mini-log", [
    {
      role: "assistant",
      text: "可针对当前方案提问，例如调整渠道或合规旁注。",
    },
  ]);
  const [optionCount, setOptionCount] = useCanvasState("option-count", 4);
  const [gateResult, setGateResult] = useCanvasState<GateResult>(
    "option-gate",
    "idle",
  );
  const [genNote, setGenNote] = useCanvasState("option-gen-note", "");
  const visibleOptions = OPTIONS.slice(0, Math.max(3, Math.min(5, optionCount)));
  const opt = visibleOptions.find((o) => o.id === tab) ?? visibleOptions[0];

  const gateLabel =
    gateResult === "pass"
      ? "通过（原型）· 仍须正式 MLR，不替代签批"
      : gateResult === "conditional"
        ? "附条件（原型）· 院内会须机构同意 + 代表备案后再执行"
        : gateResult === "reject"
          ? "拒绝（原型）· 含促销话术风险，请修订后重送"
          : null;

  return (
    <Stack gap={24}>
      <Row align="end" justify="space-between" wrap gap={12}>
        <Stack gap={6}>
          <Text tone="secondary" style={{ fontSize: 12 }}>
            一人一策
          </Text>
          <H1 style={{ fontSize: 28, fontWeight: 500, margin: 0 }}>
            {twin.name} · 方案选项
          </H1>
          <Text
            style={{
              fontSize: 11,
              fontFamily: "ui-monospace, monospace",
              color: theme.text.tertiary,
            }}
          >
            hcp:{twin.id}
            {twin.authorIds.google_scholar
              ? ` · scholar=${twin.authorIds.google_scholar}`
              : " · 文献号见洞察/详情"}
          </Text>
        </Stack>
        <Row gap={8}>
          <Button
            variant="primary"
            onClick={() => {
              if (!demo) {
                setGenNote(
                  "请先选定具备洞察的分身（朱同玉样例可生成）。当前分身洞察骨架未就绪，已拒绝空跑。",
                );
                return;
              }
              setOptionCount(4);
              setTab("o1");
              setGateResult("idle");
              setGenNote("已基于当前洞察与机会生成 4 条方案（原型写入会话状态）。");
            }}
          >
            生成方案
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (!demo) {
                setGateResult("idle");
                setGenNote("未选定可生成方案的分身，无法送闸门。");
                return;
              }
              setGateResult((g) =>
                g === "idle" || g === "reject"
                  ? "pass"
                  : g === "pass"
                    ? "conditional"
                    : "reject",
              );
            }}
          >
            送合规闸门检查
          </Button>
        </Row>
      </Row>

      {genNote ? (
        <Text tone="secondary" style={{ fontSize: 13 }}>
          {genNote}
        </Text>
      ) : null}
      {gateLabel ? (
        <div
          style={{
            borderLeft: `2px solid ${theme.accent.primary}`,
            padding: "8px 12px",
            background: theme.fill.tertiary,
          }}
        >
          <Text style={{ fontSize: 13 }}>{gateLabel}</Text>
        </div>
      ) : null}

      {!demo ? (
        <Text tone="secondary" style={{ fontSize: 13 }}>
          非验收样例分身：方案正文为演示骨架，生成按钮将拒绝对空洞察空跑。
        </Text>
      ) : null}

      <Row gap={4} wrap>
        {visibleOptions.map((o) => (
          <div key={o.id}>
            <Button
              variant={tab === o.id ? "primary" : "ghost"}
              onClick={() => setTab(o.id)}
            >
              {o.label}
            </Button>
          </div>
        ))}
      </Row>

      <div
        style={{
          border: `1px solid ${theme.stroke.tertiary}`,
          borderLeft: `2px solid ${
            opt.priority === "P0" ? theme.accent.primary : theme.stroke.secondary
          }`,
          borderRadius: 4,
          padding: 20,
          background: theme.bg.elevated,
        }}
      >
        <Stack gap={12}>
          <Row gap={8} align="center">
            <TagChip
              label={opt.priority}
              variant={opt.priority === "P0" ? "tier2" : "soft"}
            />
            <Text weight="semibold" style={{ fontSize: 14 }}>
              {opt.action}
            </Text>
          </Row>
          <Grid columns="120px 1fr" gap={8}>
            <Text tone="tertiary" style={{ fontSize: 12 }}>
              负责人
            </Text>
            <Text style={{ fontSize: 13 }}>{opt.owner}</Text>
            <Text tone="tertiary" style={{ fontSize: 12 }}>
              渠道
            </Text>
            <Code>{opt.channel}</Code>
            <Text tone="tertiary" style={{ fontSize: 12 }}>
              内容主题
            </Text>
            <Text style={{ fontSize: 13 }}>{opt.topic}</Text>
            <Text tone="tertiary" style={{ fontSize: 12 }}>
              成功信号
            </Text>
            <Text style={{ fontSize: 13, lineHeight: 1.5 }}>{opt.signal}</Text>
            <Text tone="tertiary" style={{ fontSize: 12 }}>
              合规旁注
            </Text>
            <Text tone="secondary" style={{ fontSize: 12, lineHeight: 1.5 }}>
              {opt.compliance}
            </Text>
            <Text tone="tertiary" style={{ fontSize: 12 }}>
              引用
            </Text>
            <Row gap={8} wrap>
              <Code>{opt.academicRefs}</Code>
              <Code>{opt.complianceRefs}</Code>
            </Row>
          </Grid>
        </Stack>
      </div>

      <div
        style={{
          borderTop: `1px solid ${theme.stroke.tertiary}`,
          paddingTop: 16,
        }}
      >
        <Text weight="medium" style={{ fontSize: 13, marginBottom: 8 }}>
          与 Agent 讨论本方案（mode=revise_options · {opt.id}）
        </Text>
        <Stack gap={8}>
          {miniLog.map((m, i) => (
            <div
              key={i}
              style={{
                padding: "8px 10px",
                background:
                  m.role === "user" ? theme.fill.tertiary : "transparent",
                borderLeft:
                  m.role === "assistant"
                    ? `2px solid ${theme.accent.primary}`
                    : "2px solid transparent",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              <Text style={{ fontSize: 13 }}>{m.text}</Text>
            </div>
          ))}
          <Row gap={8} align="end">
            <div style={{ flex: 1 }}>
              <TextArea
                value={miniChat}
                onChange={setMiniChat}
                rows={2}
                placeholder="输入问题…"
              />
            </div>
            <Button
              variant="primary"
              onClick={() => {
                if (!miniChat.trim()) return;
                const q = miniChat.trim();
                setMiniLog((prev) => [
                  ...prev,
                  { role: "user", text: q },
                  {
                    role: "assistant",
                    text: `（原型 revise_options）已记录对「${opt.label}」的修订意向。完整开放对话请用「HCP Engagement Agent」（open_chat）。`,
                  },
                ]);
                setMiniChat("");
              }}
            >
              发送
            </Button>
          </Row>
        </Stack>
      </div>
    </Stack>
  );
}

function AgentPage() {
  const theme = useHostTheme();
  const [sessions, setSessions] = useCanvasState<ChatSession[]>(
    "agent-sessions-cookie",
    [
      {
        id: "s1",
        title: "朱同玉 · 噬菌体方案",
        messages: [
          { role: "user", text: "方案 1 的合规边界如何收紧？" },
          {
            role: "assistant",
            text: "保持 MSL 科学交流；禁止促销话术；输出须送 MLR。",
          },
        ],
      },
      {
        id: "s2",
        title: "新建对话",
        messages: [
          {
            role: "assistant",
            text: "我是 HCP Engagement Agent。可上传附件并讨论一人一策。历史会话原型写入持久化状态（生产用浏览器 cookie）。",
          },
        ],
      },
    ],
  );
  const [activeId, setActiveId] = useCanvasState("agent-active", "s1");
  const [draft, setDraft] = useCanvasState("agent-draft", "");
  const [files, setFiles] = useCanvasState<string[]>("agent-files", []);
  const [panelW, setPanelW] = useCanvasState("agent-panel-w", 720);
  const [panelH, setPanelH] = useCanvasState("agent-panel-h", 420);
  const [dragOrigin, setDragOrigin] = useCanvasState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>("agent-drag-origin", null);

  const active = sessions.find((s) => s.id === activeId) ?? sessions[0];

  return (
    <Stack gap={16}>
      <Stack gap={4}>
        <Text tone="secondary" style={{ fontSize: 12 }}>
          HCP Engagement Agent
        </Text>
        <H1 style={{ fontSize: 24, fontWeight: 500, margin: 0 }}>对话式智能体</H1>
        <Text tone="tertiary" style={{ fontSize: 12 }}>
          历史存 cookie（原型：持久化 state）· 可上传附件 · 右上角手柄拖动 resize
        </Text>
      </Stack>

      <div style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
        <div
          style={{
            width: 200,
            flexShrink: 0,
            borderRight: `1px solid ${theme.stroke.tertiary}`,
            paddingRight: 12,
          }}
        >
          <Text weight="medium" style={{ fontSize: 12, marginBottom: 8 }}>
            历史对话
          </Text>
          <Stack gap={4}>
            {sessions.map((s) => (
              <div key={s.id}>
                <Button
                  variant={s.id === activeId ? "primary" : "ghost"}
                  onClick={() => setActiveId(s.id)}
                >
                  {s.title}
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              onClick={() => {
                const id = `s${Date.now()}`;
                setSessions((prev) => [
                  {
                    id,
                    title: "新建对话",
                    messages: [
                      { role: "assistant", text: "新会话已创建。" },
                    ],
                  },
                  ...prev,
                ]);
                setActiveId(id);
              }}
            >
              新建
            </Button>
          </Stack>
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 280,
            width: panelW,
            maxWidth: "100%",
            height: panelH,
            border: `1px solid ${theme.stroke.tertiary}`,
            borderRadius: 4,
            background: theme.bg.elevated,
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
          onPointerMove={(e: {
            clientX: number;
            clientY: number;
          }) => {
            if (!dragOrigin) return;
            const dw = e.clientX - dragOrigin.x;
            const dh = e.clientY - dragOrigin.y;
            setPanelW(Math.min(960, Math.max(400, dragOrigin.w + dw)));
            setPanelH(Math.min(720, Math.max(280, dragOrigin.h + dh)));
          }}
          onPointerUp={() => setDragOrigin(null)}
          onPointerLeave={() => setDragOrigin(null)}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              padding: "6px 8px",
              borderBottom: `1px solid ${theme.stroke.tertiary}`,
              gap: 8,
            }}
          >
            <Text tone="tertiary" style={{ fontSize: 11, marginRight: "auto" }}>
              {active.title}
            </Text>
            <Text
              tone="tertiary"
              style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}
            >
              {panelW}×{panelH}
            </Text>
            <div
              title="拖动以调整面板大小"
              onPointerDown={(e: {
                clientX: number;
                clientY: number;
                pointerId: number;
                currentTarget: { setPointerCapture?: (id: number) => void };
              }) => {
                e.currentTarget.setPointerCapture?.(e.pointerId);
                setDragOrigin({
                  x: e.clientX,
                  y: e.clientY,
                  w: panelW,
                  h: panelH,
                });
              }}
              style={{
                width: 16,
                height: 16,
                borderRight: `2px solid ${theme.accent.primary}`,
                borderTop: `2px solid ${theme.accent.primary}`,
                cursor: "nwse-resize",
                opacity: 0.85,
              }}
            />
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
            <Stack gap={10}>
              {active.messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    padding: "8px 10px",
                    background:
                      m.role === "user" ? theme.fill.tertiary : "transparent",
                    borderLeft:
                      m.role === "assistant"
                        ? `2px solid ${theme.accent.primary}`
                        : "2px solid transparent",
                  }}
                >
                  <Text style={{ fontSize: 13, lineHeight: 1.5 }}>{m.text}</Text>
                </div>
              ))}
              {files.length > 0 ? (
                <Text tone="tertiary" style={{ fontSize: 12 }}>
                  附件：{files.join(" · ")}
                </Text>
              ) : null}
            </Stack>
          </div>

          <div
            style={{
              borderTop: `1px solid ${theme.stroke.tertiary}`,
              padding: 10,
            }}
          >
            <Stack gap={8}>
              <TextArea
                value={draft}
                onChange={setDraft}
                rows={2}
                placeholder="输入消息…"
              />
              <Row gap={8} align="center">
                <Button
                  variant="secondary"
                  onClick={() =>
                    setFiles((f) => [...f, `附件-${f.length + 1}.pdf`])
                  }
                >
                  上传附件
                </Button>
                <Spacer />
                <Button
                  variant="primary"
                  onClick={() => {
                    if (!draft.trim()) return;
                    const text = draft.trim();
                    setSessions((prev) =>
                      prev.map((s) =>
                        s.id === activeId
                          ? {
                              ...s,
                              messages: [
                                ...s.messages,
                                { role: "user", text },
                                {
                                  role: "assistant",
                                  text: "（原型回复）已收到。正式环境将调用 hcp-engagement-agent。",
                                },
                              ],
                            }
                          : s,
                      ),
                    );
                    setDraft("");
                  }}
                >
                  发送
                </Button>
              </Row>
            </Stack>
          </div>
        </div>
      </div>
    </Stack>
  );
}

function TwinBuildingPage({
  twin,
  stageIndex,
  onAdvance,
  onSkip,
}: {
  twin: TwinRow;
  stageIndex: number;
  onAdvance: () => void;
  onSkip: () => void;
}) {
  const theme = useHostTheme();
  const last = stageIndex >= BUILD_STAGES.length - 1;
  return (
    <Stack gap={20}>
      <Text tone="secondary" style={{ fontSize: 12 }}>
        Twin 构建进度
      </Text>
      <H1 style={{ fontSize: 24, fontWeight: 500, margin: 0 }}>
        正在补齐 · {twin.name}
      </H1>
      <Text tone="secondary" style={{ fontSize: 13 }}>
        身份锁定 → 职业 → 科研 → 洞察。专科知识按需灌注异步进行，不阻塞浏览基本信息。
      </Text>
      <Stack gap={8}>
        {BUILD_STAGES.map((label, i) => {
          const done = i < stageIndex;
          const current = i === stageIndex;
          return (
            <div
              key={label}
              style={{
                padding: "10px 12px",
                borderLeft: `2px solid ${
                  current || done ? theme.accent.primary : theme.stroke.tertiary
                }`,
                background: current ? theme.fill.tertiary : "transparent",
              }}
            >
              <Text style={{ fontSize: 13 }}>
                {done ? "完成" : current ? "进行中" : "等待"} · {label}
              </Text>
            </div>
          );
        })}
      </Stack>
      <Row gap={8}>
        <Button variant="primary" onClick={last ? onSkip : onAdvance}>
          {last ? "完成并进入详情" : "下一步"}
        </Button>
        {!last ? (
          <Button variant="ghost" onClick={onSkip}>
            跳过剩余（原型）
          </Button>
        ) : null}
      </Row>
    </Stack>
  );
}

export default function HcpUiPrototype() {
  const [page, setPage] = useCanvasState<PageId>("page", "twin");
  const [twins, setTwins] = useCanvasState<TwinRow[]>("twins", INITIAL_TWINS);
  const [twinView, setTwinView] = useCanvasState<TwinView>("twin-view", "list");
  const [activeTwinId, setActiveTwinId] = useCanvasState<string | null>(
    "active-twin",
    "zhu",
  );
  const [editTarget, setEditTarget] = useCanvasState<string | null>(
    "edit-target",
    null,
  );
  const [candidates, setCandidates] = useCanvasState<HcpCandidate[]>(
    "mcp-candidates",
    [],
  );
  const [pendingTwin, setPendingTwin] = useCanvasState<TwinRow | null>(
    "pending-twin",
    null,
  );
  const [buildStage, setBuildStage] = useCanvasState("build-stage", 0);

  const safeTwins = twins.map(normalizeTwin);
  const activeTwinRaw = activeTwinId
    ? safeTwins.find((t) => t.id === activeTwinId) ?? null
    : null;
  const activeTwin = activeTwinRaw;
  const editTwinRaw = editTarget
    ? safeTwins.find((t) => t.id === editTarget) ?? null
    : null;
  const editTwin = editTwinRaw;
  const safePending = pendingTwin ? normalizeTwin(pendingTwin) : null;

  const tabsUnlocked =
    !!activeTwin &&
    twinView !== "list" &&
    twinView !== "create" &&
    twinView !== "candidates" &&
    twinView !== "confirm" &&
    twinView !== "edit";

  const goPage = (p: PageId) => {
    if ((p === "insights" || p === "options") && !tabsUnlocked) return;
    setPage(p);
    if (p === "twin" && twinView !== "building") setTwinView("list");
  };

  return (
    <AppChrome
      page={page}
      onPage={goPage}
      showHcpTabs={tabsUnlocked}
      abbrev={tabsUnlocked ? activeTwin!.abbrev : "—"}
    >
      {page === "twin" && twinView === "list" ? (
        <TwinListPage
          twins={safeTwins}
          onOpen={(id) => {
            setActiveTwinId(id);
            setTwinView("detail");
            setPage("twin");
          }}
          onEdit={(id) => {
            setEditTarget(id);
            setActiveTwinId(id);
            setTwinView("edit");
            setPage("twin");
          }}
          onDelete={(id) => {
            const remaining = safeTwins.filter((t) => t.id !== id);
            setTwins(remaining);
            if (activeTwinId === id) {
              setActiveTwinId(null);
              setPage("twin");
            }
            setTwinView("list");
          }}
          onAdd={() => {
            setEditTarget(null);
            setPendingTwin(null);
            setCandidates([]);
            setTwinView("create");
            setPage("twin");
          }}
        />
      ) : null}

      {page === "twin" && twinView === "create" ? (
        <TwinCreatePage
          onBack={() => setTwinView("list")}
          onQueried={(_n, _h, _d, list) => {
            setCandidates(list);
            setTwinView("candidates");
          }}
        />
      ) : null}

      {page === "twin" && twinView === "candidates" ? (
        <TwinCandidatesPage
          candidates={candidates}
          onBack={() => setTwinView("create")}
          onSelect={(c) => {
            const id = `hcp-${Date.now()}`;
            setPendingTwin(candidateToTwin(c, id));
            setTwinView("confirm");
          }}
        />
      ) : null}

      {page === "twin" && twinView === "confirm" && safePending ? (
        <TwinDetailPage
          twin={safePending}
          mode="confirm"
          onBack={() => setTwinView("candidates")}
          onConfirmSave={() => {
            const saved = safePending;
            setTwins((prev) => {
              const normalized = prev.map(normalizeTwin);
              if (normalized.some((t) => t.id === saved.id)) {
                return normalized.map((t) => (t.id === saved.id ? saved : t));
              }
              return [...normalized, saved];
            });
            setActiveTwinId(saved.id);
            setPendingTwin(null);
            setBuildStage(0);
            setTwinView("building");
            setPage("twin");
          }}
        />
      ) : null}

      {page === "twin" && twinView === "building" && activeTwin ? (
        <TwinBuildingPage
          twin={activeTwin}
          stageIndex={buildStage}
          onAdvance={() => setBuildStage((s) => s + 1)}
          onSkip={() => {
            setBuildStage(BUILD_STAGES.length);
            setTwinView("detail");
          }}
        />
      ) : null}

      {page === "twin" && twinView === "detail" && activeTwin ? (
        <TwinDetailPage
          twin={activeTwin}
          mode="saved"
          onBack={() => {
            setTwinView("list");
            setPage("twin");
          }}
          onEdit={() => {
            setEditTarget(activeTwin.id);
            setTwinView("edit");
          }}
        />
      ) : null}

      {page === "twin" && twinView === "edit" && editTwin ? (
        <TwinEditPage
          twin={editTwin}
          onBack={() => setTwinView("list")}
          onSave={(patch) => {
            setTwins((prev) =>
              prev.map((t) =>
                t.id === editTwin.id
                  ? {
                      ...t,
                      name: patch.name,
                      hospital: patch.hospital,
                      dept: patch.dept,
                      abbrev: patch.name.slice(0, 1) || t.abbrev,
                    }
                  : t,
              ),
            );
            setActiveTwinId(editTwin.id);
            setTwinView("detail");
            setPage("twin");
          }}
        />
      ) : null}

      {page === "insights" && activeTwin && tabsUnlocked ? (
        <InsightsPage twin={activeTwin} />
      ) : null}
      {page === "options" && activeTwin && tabsUnlocked ? (
        <OptionsPage twin={activeTwin} />
      ) : null}
      {page === "agent" ? <AgentPage /> : null}
    </AppChrome>
  );
}

