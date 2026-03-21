import type { WorkflowRunStatus } from "../../hooks/workflow-types.js";
import type { CoreTokenName } from "../../theme/tokens.js";

export interface WorkflowStatusIcon {
  icon: string;
  fallback: string;
  color: CoreTokenName;
  bold: boolean;
  label: string;
}

export type StepStatus = "success" | "failure" | "running" | "pending" | "skipped";

export interface MiniRun {
  status: WorkflowRunStatus;
}

const RUN_STATUS_ICONS: Record<WorkflowRunStatus, WorkflowStatusIcon> = {
  success:   { icon: "✓", fallback: "[OK]", color: "success", bold: false, label: "Success" },
  failure:   { icon: "✗", fallback: "[FL]", color: "error",   bold: true,  label: "Failure" },
  running:   { icon: "◎", fallback: "[..]", color: "warning", bold: true,  label: "Running" },
  queued:    { icon: "◌", fallback: "[__]", color: "primary", bold: false, label: "Queued" },
  cancelled: { icon: "✕", fallback: "[XX]", color: "muted",  bold: false, label: "Cancelled" },
  error:     { icon: "⚠", fallback: "[ER]", color: "error",   bold: true,  label: "Error" },
};

export function getRunStatusIcon(status: WorkflowRunStatus): WorkflowStatusIcon {
  return RUN_STATUS_ICONS[status] ?? { icon: "?", fallback: "[??]", color: "muted", bold: false, label: "Unknown" };
}

const STEP_STATUS_ICONS: Record<StepStatus, WorkflowStatusIcon> = {
  success: { icon: "✓", fallback: "[OK]", color: "success", bold: false, label: "Success" },
  failure: { icon: "✗", fallback: "[FL]", color: "error",   bold: true,  label: "Failure" },
  running: { icon: "◎", fallback: "[..]", color: "warning", bold: true,  label: "Running" },
  pending: { icon: "◌", fallback: "[__]", color: "muted",   bold: false, label: "Pending" },
  skipped: { icon: "⊘", fallback: "[SK]", color: "muted",   bold: false, label: "Skipped" },
};

export function getStepStatusIcon(status: string): WorkflowStatusIcon {
  const normalized = status.toLowerCase();
  if (normalized === "success" || normalized === "failure" || normalized === "running" || normalized === "pending" || normalized === "skipped") {
    return STEP_STATUS_ICONS[normalized];
  }
  return { icon: "?", fallback: "[??]", color: "muted", bold: false, label: status };
}

export function getRunStatusIconNoColor(status: WorkflowRunStatus): WorkflowStatusIcon {
  const base = getRunStatusIcon(status);
  return { ...base, color: "muted", bold: false };
}

export function getStepStatusIconNoColor(status: string): WorkflowStatusIcon {
  const base = getStepStatusIcon(status);
  return { ...base, color: "muted", bold: false };
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return "—";
  }
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  if (m < 60) return `${m}m ${remS}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m`;
}

export function getDurationColor(seconds: number | null | undefined): CoreTokenName {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return "muted";
  }
  if (seconds < 60) return "success";
  if (seconds < 300) return "muted";
  if (seconds < 900) return "warning";
  return "error";
}

export function formatRelativeTime(timestamp: string | null | undefined, now?: Date): string {
  if (!timestamp) return "—";
  try {
    const then = new Date(timestamp).getTime();
    if (Number.isNaN(then)) return "—";
    const nowMs = (now ?? new Date()).getTime();
    const deltaSec = Math.max(0, Math.floor((nowMs - then) / 1000));
    if (deltaSec < 60) return "now";
    const deltaMin = Math.floor(deltaSec / 60);
    if (deltaMin < 60) return `${deltaMin}m`;
    const deltaHr = Math.floor(deltaMin / 60);
    if (deltaHr < 24) return `${deltaHr}h`;
    const deltaDay = Math.floor(deltaHr / 24);
    if (deltaDay < 7) return `${deltaDay}d`;
    if (deltaDay < 30) return `${Math.floor(deltaDay / 7)}w`;
    if (deltaDay < 365) return `${Math.floor(deltaDay / 30)}mo`;
    return `${Math.floor(deltaDay / 365)}y`;
  } catch {
    return "—";
  }
}

const MINI_DOT: Record<WorkflowRunStatus, string> = {
  success:   "●",
  failure:   "●",
  running:   "◎",
  queued:    "○",
  cancelled: "·",
  error:     "●",
};
const EMPTY_DOT = { char: "·", color: "muted" as CoreTokenName };

export function getMiniStatusBar(
  recentRuns: readonly MiniRun[],
): Array<{ char: string; color: CoreTokenName }> {
  const slots: Array<{ char: string; color: CoreTokenName }> = [];
  const runs = recentRuns.slice(0, 5);
  for (const run of runs) {
    const dot = MINI_DOT[run.status] ?? "·";
    const color = getRunStatusIcon(run.status).color;
    slots.push({ char: dot, color });
  }
  while (slots.length < 5) {
    slots.push({ ...EMPTY_DOT });
  }
  return slots;
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }
  if (bytes === 0) return "0 B";
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const value = bytes / Math.pow(1024, exp);
  const unit = BYTE_UNITS[exp];
  if (exp === 0) return `${Math.floor(value)} ${unit}`;
  if (value < 10) return `${value.toFixed(1)} ${unit}`;
  return `${Math.floor(value)} ${unit}`;
}

export function abbreviateSHA(sha: string | null | undefined): string {
  if (!sha || sha.length === 0) return "—";
  return sha.slice(0, 7);
}

export function formatRunCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return "0";
  if (n < 1000) return String(n);
  const k = n / 1000;
  if (k < 10) return `${k.toFixed(1)}K`;
  return `${Math.floor(k)}K`;
}
