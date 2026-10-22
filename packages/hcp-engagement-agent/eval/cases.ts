import type { RagChunk } from "@hca/medical-kb";
import type { VirtualTwin, HcpInsights } from "@hca/domain";
import { sampleZhuInsights, sampleZhuTwin } from "../src/fixtures/zhu.js";

/**
 * F-AGT-033（AGT2-01）评测集：三类任务各 5 例，合计 15 例，每类至少 1 例以朱同玉 fixture 为锚点。
 * 仅用 fixture 输入与程序化断言，不写生产库；门槛见 agent-tests.md §4。
 */
export type EvalTask = "propose" | "open_chat" | "synthesize";

export type EvalCase = {
  id: string;
  task: EvalTask;
  zhu_anchor?: boolean;
  /** propose：主题侧重（写入 fixture 洞察骨架） */
  themes?: string[];
  /** propose：产品上下文 */
  product_context?: string;
  /** open_chat：用户消息 */
  message?: string;
  /** open_chat：正文必须命中的正则（源字符串） */
  requires?: string[];
  /** synthesize：覆盖 fixture twin 的研究主题 */
  synth_themes?: string[];
};

const academicChunks: RagChunk[] = [
  {
    id: "acr_point_1",
    text: "噬菌体治疗肾移植感染证据",
    score: 0.91,
    source: "pubmed",
    version: "v1",
    as_of: "2026-10-21",
    index: "academic",
    specialty: "nephrology",
    pmid: "38000101",
  },
  {
    id: "acr_point_2",
    text: "BK 病毒血症管理",
    score: 0.82,
    source: "pubmed",
    version: "v1",
    as_of: "2026-10-21",
    index: "academic",
    specialty: "nephrology",
    doi: "10.1000/bk-study",
  },
  {
    id: "acr_point_3",
    text: "肾移植后感染预防",
    score: 0.79,
    source: "pubmed",
    version: "v1",
    as_of: "2026-10-21",
    index: "academic",
    specialty: "nephrology",
    pmid: "38000102",
  },
];

const complianceChunks: RagChunk[] = [
  {
    id: "ccr_point_1",
    text: "医药代表开展学术推广须备案",
    score: 0.88,
    source: "nmpa",
    version: "v1",
    as_of: "2026-10-21",
    index: "compliance",
    authority: "NMPA",
    clause_id: "med-rep-art-12",
  },
];

export const EVAL_CHUNKS = { academic: academicChunks, compliance: complianceChunks };

/** 红线词（命中即整批不过，见 agent-tests.md §4） */
export const REDLINE_RE = /统方|保证治愈|包治|处方潜力/;

export const EVAL_CASES: EvalCase[] = [
  // —— 一人一策（propose）5 例，#1 为朱同玉锚点 ——
  { id: "propose-zhu-anchor", task: "propose", zhu_anchor: true, themes: ["肾移植后感染管理"], product_context: "肾移植术后感染领域的学术交流" },
  { id: "propose-phage", task: "propose", themes: ["噬菌体治疗"] },
  { id: "propose-bk-virus", task: "propose", themes: ["BK 病毒血症"] },
  { id: "propose-donor-ethics", task: "propose", themes: ["器官捐献与移植伦理"] },
  { id: "propose-followup", task: "propose", themes: ["移植术后随访管理"] },
  // —— 开放对话（open_chat）5 例，#1 为朱同玉锚点 ——
  { id: "chat-zhu-anchor", task: "open_chat", zhu_anchor: true, message: "朱同玉教授团队的肾移植领域能做什么形式的学术交流？科室会可行吗？", requires: ["机构同意|备案"] },
  { id: "chat-find-kol", task: "open_chat", message: "多发性硬化领域想找 KOL 医生，怎么筛选？" },
  { id: "chat-rep-filing", task: "open_chat", message: "医药代表备案管理制度 2026 年实施后，学术推广有哪些合规边界？", requires: ["备案"] },
  { id: "chat-admin-hospital", task: "open_chat", message: "和行政院长谈医院合作，哪些渠道是安全的？" },
  { id: "chat-visit-brief", task: "open_chat", message: "给代表做一次拜访前简报，应该注意哪些合规要点？", requires: ["合规"] },
  // —— 一句话洞察（synthesize）5 例，#1 为朱同玉锚点 ——
  { id: "synth-zhu-anchor", task: "synthesize", zhu_anchor: true, synth_themes: ["肾移植后感染管理"] },
  { id: "synth-bk", task: "synthesize", synth_themes: ["BK 病毒感染"] },
  { id: "synth-tolerance", task: "synthesize", synth_themes: ["器官移植免疫耐受"] },
  { id: "synth-sparse", task: "synthesize" },
  { id: "synth-dysfunction", task: "synthesize", synth_themes: ["移植物功能障碍"] },
];

/** 按 case 变体构造 fixture twin / insights（不查库） */
export function buildFixturePair(
  c: EvalCase,
): { twin: VirtualTwin; insights: HcpInsights } {
  const twin = sampleZhuTwin();
  const insights = sampleZhuInsights();
  const themes = c.themes ?? c.synth_themes;
  if (themes?.length) {
    twin.research = {
      ...(twin.research ?? {}),
      author_ids: twin.research?.author_ids ?? { openalex: "A5101900734" },
      themes,
      recent_pubs: twin.research?.recent_pubs ?? [],
    };
    insights.interest_directions = themes.map((t) => ({
      title: t,
      analysis: `从 research.themes 派生：${t}`,
      confidence: "medium" as const,
    }));
  }
  return { twin, insights };
}