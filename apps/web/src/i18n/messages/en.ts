import type { Messages } from "../types";

export const en: Messages = {
  "shell.list": "HCP Digital Twins",
  "shell.agent": "HCP Engagement Agent",
  "workspace.tab.profile": "HCP Profile",
  "workspace.tab.insights": "HCP Insights",
  "workspace.tab.options": "Engagement Options",
  "workspace.action.edit": "Edit",
  "workspace.action.delete": "Delete",
  "workspace.action.close": "Close tab",
  "workspace.delete.confirm":
    "Delete “{name}”? This cannot be undone; insights and engagement options will be removed.",
  "workspace.delete.submit": "Confirm delete",
  "workspace.delete.cancel": "Cancel",
  "career.kind.education": "Education",
  "career.kind.current": "Current",
  "career.kind.past": "Past",
  "career.kind.society": "Society",
  "career.empty":
    "No career timeline entries yet. They may be filled after intelligence build (MVP-2).",
  "career.role.default": "Role",
  "newtwin.dept.provenance.caller_input":
    "Department comes from your input hint, not verified against data sources",
  "newtwin.dept.provenance.fixture":
    "Department comes from sample data, not verified against data sources",
  "newtwin.dept.mismatch":
    "Data-source signal check: input side {input_side} · source side {signal_side}; please verify the department",
  "newtwin.dept.preview.title": "Department → specialties to prefill",
  "newtwin.dept.preview.ok": "{input} → {specialty}",
  "newtwin.dept.preview.skipped":
    "{input}: no controlled specialty match, prefill will skip it",
};
