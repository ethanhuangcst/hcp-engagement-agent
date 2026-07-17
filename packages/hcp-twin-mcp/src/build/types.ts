import type { McpError } from "@hca/domain";

export type BuildPhase =
  | "queued"
  | "identity"
  | "career"
  | "research"
  | "heatmap"
  | "insights"
  | "done"
  | "error";

export type BuildMode = "full" | "incremental";

export type BuildStatus = {
  runId: string;
  hcpId: string;
  mode: BuildMode;
  phase: BuildPhase;
  progress: number;
  message: string;
  error?: McpError;
  updated_at: string;
  started_at: string;
  finished_at?: string;
};

export const PHASE_PROGRESS: Record<BuildPhase, number> = {
  queued: 0,
  identity: 0.15,
  career: 0.35,
  research: 0.55,
  heatmap: 0.75,
  insights: 0.9,
  done: 1,
  error: 1,
};
