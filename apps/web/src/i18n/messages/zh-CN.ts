import type { Messages } from "../types";

export const zhCN: Messages = {
  "shell.list": "HCP数字分身",
  "shell.agent": "HCP Engagement Agent",
  "workspace.tab.profile": "HCP资料",
  "workspace.tab.insights": "HCP洞察",
  "workspace.tab.options": "一人一策",
  "workspace.action.edit": "修改",
  "workspace.action.delete": "删除",
  "workspace.action.close": "关闭本页",
  "workspace.delete.confirm":
    "确认删除「{name}」？删除后不可从列表恢复，洞察与一人一策将收回。",
  "workspace.delete.submit": "确认删除",
  "workspace.delete.cancel": "取消",
  "career.kind.education": "教育",
  "career.kind.current": "现任",
  "career.kind.past": "曾任",
  "career.kind.society": "学会",
  "career.empty": "暂无职业轨迹节点。确认保存后可由情报构建补齐（MVP-2）。",
  "career.role.default": "职位",
  "newtwin.dept.provenance.caller_input": "科室来自您的输入提示，未经数据源核实",
  "newtwin.dept.provenance.fixture": "科室来自样例数据，未经数据源核实",
  "newtwin.dept.mismatch":
    "数据源信号对照：输入侧 {input_side} · 数据源侧 {signal_side}，请核对科室",
  "newtwin.dept.preview.title": "科室 → 将预灌专科",
  "newtwin.dept.preview.ok": "{input} → {specialty}",
  "newtwin.dept.preview.skipped": "{input}：无法映射到受控专科，预灌将跳过",
  "newtwin.dept.incoming":
    "将入库科室：{department}（来自选中记录的数据源信号，不可编辑）",
  "newtwin.dept.gate.checkbox":
    "已人工核对科室，确认按数据源信号侧入库",
  "newtwin.dept.gate.required":
    "输入科室与数据源信号不一致：须勾选「已人工核对科室」后才能保存",
  "newtwin.dept.missing.block":
    "选中记录无科室信号，无法确定入库科室：请换检索条件重新查询，或人工核实后再试",
};
