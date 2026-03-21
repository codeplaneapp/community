import React from "react";
import type { RGBA } from "@opentui/core";
import type { ThemeTokens } from "../theme/tokens.js";
import { isUnicodeSupported } from "../theme/detect.js";
import { useTheme } from "../hooks/useTheme.js";
import { useSpinner } from "../hooks/useSpinner.js";
import { useLayout } from "../hooks/useLayout.js";

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Extended workspace status values.
 *
 * Includes the 6 API-defined statuses (`pending`, `starting`, `running`,
 * `suspended`, `stopped`, `failed`) plus transitional display states
 * that appear during optimistic updates (e.g., user presses "suspend"
 * → status shows "suspending" before server confirms).
 */
export type WorkspaceDisplayStatus =
  | "pending"
  | "starting"
  | "running"
  | "stopping"
  | "suspending"
  | "suspended"
  | "resuming"
  | "stopped"
  | "deleted"
  | "error"
  | "failed";

/** Visual configuration for a single workspace status value. */
interface StatusConfig {
  /** Semantic token name to resolve from ThemeTokens. */
  readonly tokenName: keyof ThemeTokens;
  /** Whether to show an animated spinner instead of a static dot. */
  readonly animated: boolean;
  /** Human-readable label text. */
  readonly label: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Static dot character: ● on Unicode terminals, * on ASCII fallback. */
const DOT: string = isUnicodeSupported() ? "●" : "*";

/**
 * Status → visual configuration mapping.
 * Frozen at module scope — zero per-render allocation.
 */
const STATUS_CONFIG: Readonly<Record<WorkspaceDisplayStatus, StatusConfig>> =
  Object.freeze({
    running:    { tokenName: "success", animated: false, label: "Running" },
    starting:   { tokenName: "warning", animated: true,  label: "Starting" },
    stopping:   { tokenName: "warning", animated: true,  label: "Stopping" },
    suspending: { tokenName: "warning", animated: true,  label: "Suspending" },
    resuming:   { tokenName: "warning", animated: true,  label: "Resuming" },
    suspended:  { tokenName: "muted",   animated: false, label: "Suspended" },
    stopped:    { tokenName: "muted",   animated: false, label: "Stopped" },
    deleted:    { tokenName: "muted",   animated: false, label: "Deleted" },
    error:      { tokenName: "error",   animated: false, label: "Error" },
    failed:     { tokenName: "error",   animated: false, label: "Failed" },
    pending:    { tokenName: "warning", animated: false, label: "Pending" },
  });

/**
 * Exported for test assertions only.
 * Do not use in production code — use the WorkspaceStatusBadge component.
 * @internal
 */
export { STATUS_CONFIG as _STATUS_CONFIG_FOR_TESTING };

// ── Props ────────────────────────────────────────────────────────────────────

export interface WorkspaceStatusBadgeProps {
  /** The workspace status to display. */
  readonly status: WorkspaceDisplayStatus;

  /**
   * Compact mode for list row usage.
   *
   * When true, uses tighter horizontal layout (zero gap between icon and label).
   * Combined with minimum breakpoint, shows icon only.
   *
   * @default false
   */
  readonly compact?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Reusable workspace status badge.
 *
 * Renders a workspace status as a colored icon with optional label text.
 * Transitional states (starting, stopping, suspending, resuming) display
 * an animated braille spinner instead of a static dot. All spinners are
 * frame-synchronized via the shared `useSpinner()` hook.
 *
 * Responsive behavior:
 * - Minimum breakpoint (80×24): icon only, no label text
 * - Standard+ breakpoint (120×40+): icon + label text
 *
 * @example
 * ```tsx
 * // In a workspace list row (compact):
 * <WorkspaceStatusBadge status={workspace.status} compact />
 *
 * // In a workspace detail header (full):
 * <WorkspaceStatusBadge status={workspace.status} />
 * ```
 */
export function WorkspaceStatusBadge({
  status,
  compact = false,
}: WorkspaceStatusBadgeProps): React.ReactNode {
  const theme = useTheme();
  const { breakpoint } = useLayout();
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const color: RGBA = theme[config.tokenName];
  const spinnerFrame = useSpinner(config.animated);

  // Determine the icon: animated spinner frame or static dot
  const icon: string = config.animated ? spinnerFrame : DOT;

  // At minimum breakpoint (or below, which should have triggered AppShell fallback): icon only
  const showLabel = breakpoint && breakpoint !== "minimum";

  if (!showLabel) {
    return <text fg={color}>{icon}</text>;
  }

  // Standard+: icon + label in horizontal row
  return (
    <box flexDirection="row" gap={compact ? 0 : 1} alignItems="center">
      <text fg={color}>{icon}</text>
      <text fg={color}>{config.label}</text>
    </box>
  );
}
