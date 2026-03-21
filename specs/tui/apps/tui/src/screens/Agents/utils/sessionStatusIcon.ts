import type { AgentSessionStatus } from "@codeplane/ui-core";
import type { StatusIconConfig } from "../types.js";

const STATUS_ICON_MAP: Record<AgentSessionStatus, StatusIconConfig> = {
  active:    { icon: "●", fallback: "[A]", color: "success",  bold: true },
  completed: { icon: "✓", fallback: "[C]", color: "success",  bold: false },
  failed:    { icon: "✗", fallback: "[F]", color: "error",    bold: false },
  timed_out: { icon: "⏱", fallback: "[T]", color: "warning",  bold: false },
  pending:   { icon: "○", fallback: "[P]", color: "muted",    bold: false },
};

export function getStatusIcon(status: AgentSessionStatus): StatusIconConfig {
  return STATUS_ICON_MAP[status] ?? STATUS_ICON_MAP.pending;
}
