import React from "react";
import type { SessionStatusFilter } from "../types.js";
import { STATUS_FILTER_LABELS } from "../types.js";

interface SessionEmptyStateProps {
  reason: "none" | "zero_sessions" | "filter_empty" | "search_empty";
  activeFilter: SessionStatusFilter;
  searchQuery: string;
}

export function SessionEmptyState({
  reason, activeFilter, searchQuery,
}: SessionEmptyStateProps): React.ReactElement {
  let message: string;
  let hint: string | null = null;

  switch (reason) {
    case "zero_sessions":
      message = "No agent sessions yet.";
      hint = "Press n to create one.";
      break;
    case "filter_empty":
      message = `No ${STATUS_FILTER_LABELS[activeFilter]} sessions.`;
      hint = "Press f to cycle filter.";
      break;
    case "search_empty":
      message = `No sessions match "${searchQuery}".`;
      break;
    default:
      message = "";
      break;
  }

  return (
    <box justifyContent="center" alignItems="center" flexGrow={1}>
      <text>{message}</text>
      {hint && <text>{hint}</text>}
    </box>
  );
}
