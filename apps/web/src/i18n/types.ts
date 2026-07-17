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
  | "career.role.default";

export type Messages = Record<MessageKey, string>;
