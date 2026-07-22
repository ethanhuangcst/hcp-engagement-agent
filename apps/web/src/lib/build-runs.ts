/**
 * BFF 仅记 runId 映射（进度真相在 MCP 进程内队列）。
 * 禁止再维护假进度 stub。
 */
const lastRunByHcp = new Map<string, string>();

export function rememberBuildRun(hcpId: string, runId: string): void {
  lastRunByHcp.set(hcpId, runId);
}

export function getRememberedRunId(hcpId: string): string | null {
  return lastRunByHcp.get(hcpId) ?? null;
}
