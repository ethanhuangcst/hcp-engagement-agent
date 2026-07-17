import type { HttpClient } from "./http.js";

export type TrialHit = {
  nct_id: string;
  title: string;
  status?: string;
  start_date?: string | null;
  url: string;
  source_type: "clinicaltrials";
  confidence: "medium";
};

/** ClinicalTrials.gov API v2 — 公开试验旁证（非拜访记录）. */
export async function searchCtGovByInvestigator(
  http: HttpClient,
  name: string,
  pageSize = 10,
): Promise<TrialHit[]> {
  const q = encodeURIComponent(name.trim());
  const data = await http.getJson<{
    studies?: Array<{
      protocolSection?: {
        identificationModule?: { nctId?: string; briefTitle?: string };
        statusModule?: {
          overallStatus?: string;
          startDateStruct?: { date?: string };
        };
      };
    }>;
  }>(
    `https://clinicaltrials.gov/api/v2/studies?query.term=${q}&pageSize=${pageSize}&format=json`,
  );

  const out: TrialHit[] = [];
  for (const s of data.studies ?? []) {
    const id = s.protocolSection?.identificationModule?.nctId;
    const title = s.protocolSection?.identificationModule?.briefTitle;
    if (!id || !title) continue;
    out.push({
      nct_id: id,
      title,
      status: s.protocolSection?.statusModule?.overallStatus,
      start_date: s.protocolSection?.statusModule?.startDateStruct?.date ?? null,
      url: `https://clinicaltrials.gov/study/${id}`,
      source_type: "clinicaltrials",
      confidence: "medium",
    });
  }
  return out;
}
