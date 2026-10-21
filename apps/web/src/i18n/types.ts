export type Locale = "zh-CN" | "en";

export type MessageKey =
  | "shell.list"
  | "shell.agent"
  | "workspace.tab.profile"
  | "workspace.tab.insights"
  | "workspace.tab.options"
  | "workspace.action.edit"
  | "workspace.action.delete"
  | "workspace.action.close"
  | "workspace.delete.confirm"
  | "workspace.delete.submit"
  | "workspace.delete.cancel"
  | "career.kind.education"
  | "career.kind.current"
  | "career.kind.past"
  | "career.kind.society"
  | "career.empty"
  | "career.role.default"
  | "newtwin.dept.provenance.caller_input"
  | "newtwin.dept.provenance.fixture"
  | "newtwin.dept.mismatch"
  | "newtwin.dept.preview.title"
  | "newtwin.dept.preview.ok"
  | "newtwin.dept.preview.skipped";

export type Messages = Record<MessageKey, string>;
