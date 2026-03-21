import React from "react";
import type { Breakpoint } from "../types.js";
import { useTheme } from "../../../hooks/useTheme.js";
import { formatDuration } from "../utils/formatDuration.js";

export interface SessionSummaryProps {
  status: "completed" | "failed" | "timed_out" | "active" | "pending";
  messageCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  workflowRunId: string | null;
  breakpoint: Breakpoint;
  onWorkflowNavigate?: (runId: string) => void;
  workflowLinkFocused?: boolean;
}

export function SessionSummary({
  status,
  messageCount,
  startedAt,
  finishedAt,
  workflowRunId,
  breakpoint,
  onWorkflowNavigate,
  workflowLinkFocused,
}: SessionSummaryProps) {
  const theme = useTheme();
  const isMin = breakpoint === "minimum";

  let statusIcon = "";
  let statusColor = theme.muted;
  let statusText = status;

  if (status === "completed") {
    statusIcon = "✓";
    statusColor = theme.success;
  } else if (status === "failed") {
    statusIcon = "✗";
    statusColor = theme.error;
  } else if (status === "timed_out") {
    statusIcon = "⏱";
    statusColor = theme.warning;
  }

  const durationText =
    startedAt && finishedAt
      ? formatDuration(startedAt, finishedAt)
      : "—";

  const msgLabel = isMin ? `${messageCount} msgs` : `Messages: ${messageCount}`;
  const durLabel = isMin ? durationText : `Duration: ${durationText}`;
  const statLabel = isMin ? statusText : `Status: ${statusIcon} ${statusText}`;

  return (
    <box flexDirection="column" marginY={1}>
      <box flexDirection="row" justifyContent="center">
        <text fg={theme.border}>═══════════════════ </text>
        <text bold>Session Complete</text>
        <text fg={theme.border}> ═══════════════════</text>
      </box>
      <box flexDirection="row" justifyContent="center" gap={2}>
        <text>{statLabel}</text>
        <text fg={theme.border}>│</text>
        <text>{msgLabel}</text>
        <text fg={theme.border}>│</text>
        <text>{durLabel}</text>
      </box>
      {workflowRunId && (
        <box flexDirection="row" justifyContent="center">
          <text>Linked workflow: </text>
          <text
            fg={theme.primary}
            inverse={workflowLinkFocused}
            underline={!workflowLinkFocused}
          >
            Run #{workflowRunId}
          </text>
          <text fg={theme.muted}>                          [Enter]</text>
        </box>
      )}
    </box>
  );
}
