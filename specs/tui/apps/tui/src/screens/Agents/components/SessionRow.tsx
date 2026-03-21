import React from "react";
import type { AgentSession } from "@codeplane/ui-core";
import type { Breakpoint, SessionListColumn } from "../types.js";
import { getStatusIcon } from "../utils/sessionStatusIcon.js";
import { truncateTitle } from "../utils/truncateTitle.js";
import { formatMessageCount } from "../utils/formatMessageCount.js";
import { formatDuration } from "../utils/formatDuration.js";
import { formatTimestamp } from "../utils/formatTimestamp.js";

interface SessionRowProps {
  session: AgentSession;
  focused: boolean;
  selected: boolean;
  columns: SessionListColumn[];
  breakpoint: Breakpoint;
  useTextFallback?: boolean;
}

export function SessionRow({
  session, focused, selected, columns, breakpoint, useTextFallback,
}: SessionRowProps): React.ReactElement {
  const iconConfig = getStatusIcon(session.status);
  const isActive = session.status === "active";
  const icon = useTextFallback ? iconConfig.fallback : iconConfig.icon;

  const titleCol = columns.find(c => c.field === "title");
  const titleInfo = truncateTitle(session.title, titleCol?.width ?? 30);

  const tsCol = columns.find(c => c.field === "timestamp");
  const timestamp = tsCol?.visible ? formatTimestamp(session.createdAt, breakpoint) : null;

  const msgCol = columns.find(c => c.field === "messageCount");
  const msgCount = msgCol?.visible ? formatMessageCount(session.messageCount) : null;

  const durCol = columns.find(c => c.field === "duration");
  const duration = durCol?.visible
    ? formatDuration(session.startedAt, session.finishedAt) : null;

  const idCol = columns.find(c => c.field === "idPrefix");
  const idPrefix = idCol?.visible ? session.id.slice(0, 8) + "…" : null;

  return (
    <box flexDirection="row" width="100%">
      <text>{icon} {titleInfo.text}</text>
    </box>
  );
}
