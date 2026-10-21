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
  "newtwin.dept.incoming":
    "Department to save: {department} (from the data-source signal of the selected record; not editable)",
  "newtwin.dept.gate.checkbox":
    "I have manually verified the department; save with the data-source signal side",
  "newtwin.dept.gate.required":
    "Your input department differs from the data-source signal: check “I have manually verified the department” to save",
  "newtwin.dept.missing.block":
    "The selected record has no department signal, so the department to save cannot be determined: retry with different search terms, or verify the department manually",
};
