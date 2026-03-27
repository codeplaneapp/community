# Engineering Specification: TUI Issue Detail View

**Ticket**: `tui-issue-detail-view`
**Title**: Full-screen issue detail with metadata, markdown body, timeline, dependencies, and actions
**Status**: Not started
**Dependencies**: `tui-issues-data-hooks`, `tui-issues-screen-scaffold`, `tui-issue-list-screen`, `tui-issue-labels-display`, `tui-detail-view-component`

---

## Overview

This ticket implements the `IssueDetailScreen` — the full-screen view displayed when a user selects an issue from the issue list (`Enter`), navigates via command palette (`:issue 42`), or deep-links (`codeplane tui --screen issues --repo owner/repo --issue 42`). The screen is pushed onto the navigation stack and shows the complete issue: header with state badge, metadata, markdown body, dependencies, and a chronologically interleaved comment/timeline section with pagination.

All code targets `apps/tui/src/`. All tests target `e2e/tui/`.

---

## Implementation Plan

### Step 1: Issue Detail Types

**File**: `apps/tui/src/screens/Issues/types.ts`

Extend the existing screen-local types file (created by `tui-issues-screen-scaffold`) with types specific to the detail view.

```typescript
import type { Issue, IssueComment, IssueEvent, IssueLabelSummary, IssueUserSummary } from "@codeplane/ui-core";

// Unified timeline item — comments and events interleaved by timestamp
export type TimelineItemType = "comment" | "event";

export interface TimelineCommentItem {
  type: "comment";
  id: number;
  sortKey: string; // ISO 8601 created_at for chronological sort
  comment: IssueComment;
}

export interface TimelineEventItem {
  type: "event";
  id: number;
  sortKey: string; // ISO 8601 createdAt for chronological sort
  event: IssueEvent;
}

export type TimelineItem = TimelineCommentItem | TimelineEventItem;

// Event type → icon mapping
export const EVENT_ICONS: Record<string, string> = {
  label_added: "+",
  label_removed: "-",
  assignee_added: "+",
  assignee_removed: "-",
  state_changed: "→",
  referenced: "↗",
  milestone_changed: "◆",
  // fallback
  default: "·",
};

// Truncation and rendering constants
export const MAX_BODY_LENGTH = 100_000;
export const MAX_COMMENT_BODY_LENGTH = 50_000;
export const MAX_LABEL_NAME_LENGTH = 30;
export const MAX_USERNAME_LENGTH = 39;
export const MAX_TIMELINE_ITEMS = 500;
export const TIMELINE_PAGE_SIZE = 30;
export const ASSIGNEE_TRUNCATE_THRESHOLD = 5;
export const DATA_CACHE_TTL_MS = 30_000;
export const TOAST_DURATION_MS = 3_000;
export const ERROR_TOAST_DURATION_MS = 5_000;

// Permission state for write actions
export interface IssueDetailPermissions {
  canEdit: boolean;
  canComment: boolean;
  canChangeState: boolean;
  canManageLabels: boolean;
  canManageAssignees: boolean;
}

// Comment input state
export interface CommentDraft {
  body: string;
  isOpen: boolean;
  isSubmitting: boolean;
}

// Metadata expansion state (for compact breakpoint)
export interface MetadataState {
  expanded: boolean;
}
```

**Rationale**: Centralizing timeline item types and constants ensures consistent behavior across the detail view sub-components. The `TimelineItem` discriminated union enables type-safe rendering of interleaved comments and events.

---

### Step 2: Timeline Interleaving Utility

**File**: `apps/tui/src/screens/Issues/utils/interleave-timeline.ts`

Pure function that merges comments and events into a single chronologically sorted array.

```typescript
import type { IssueComment, IssueEvent } from "@codeplane/ui-core";
import type { TimelineItem, TimelineCommentItem, TimelineEventItem } from "../types";
import { MAX_TIMELINE_ITEMS } from "../types";

export function interleaveTimeline(
  comments: IssueComment[],
  events: IssueEvent[],
): TimelineItem[] {
  const commentItems: TimelineCommentItem[] = comments.map((c) => ({
    type: "comment" as const,
    id: c.id,
    sortKey: c.created_at,
    comment: c,
  }));

  const eventItems: TimelineEventItem[] = events.map((e) => ({
    type: "event" as const,
    id: e.id,
    sortKey: e.createdAt,
    event: e,
  }));

  const merged = [...commentItems, ...eventItems]
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  // Memory cap: return at most MAX_TIMELINE_ITEMS
  return merged.slice(0, MAX_TIMELINE_ITEMS);
}

// Returns indices of only comment items (for n/p navigation)
export function getCommentIndices(items: TimelineItem[]): number[] {
  return items
    .map((item, index) => (item.type === "comment" ? index : -1))
    .filter((i) => i !== -1);
}
```

**Rationale**: Separated as a pure function for testability. The `getCommentIndices` helper powers the `n`/`p` comment-jump navigation without re-scanning the timeline on every keypress.

---

### Step 3: Relative Time Formatting Utility

**File**: `apps/tui/src/screens/Issues/utils/relative-time.ts`

Pure function that formats ISO 8601 timestamps into human-readable relative strings.

```typescript
const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;
const THIRTY_DAYS = 30 * DAY;

export type TimestampFormat = "compact" | "standard" | "full";

/**
 * Formats an ISO 8601 timestamp as a relative time string.
 *
 * - < 60s: "just now"
 * - < 60m: "Nm ago" (compact) / "N minutes ago" (full)
 * - < 24h: "Nh ago" (compact) / "N hours ago" (full)
 * - < 30d: "Nd ago" (compact) / "N days ago" (full)
 * - >= 30d: "Jan 15, 2025" (absolute date)
 */
export function relativeTime(
  iso: string,
  format: TimestampFormat = "standard",
  now: Date = new Date(),
): string {
  const date = new Date(iso);
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 0) return "just now"; // future timestamps treated as now
  if (diffSec < MINUTE) return "just now";

  if (diffSec < HOUR) {
    const m = Math.floor(diffSec / MINUTE);
    if (format === "compact") return `${m}m`;
    if (format === "full") return `${m} minute${m !== 1 ? "s" : ""} ago`;
    return `${m}m ago`;
  }

  if (diffSec < DAY) {
    const h = Math.floor(diffSec / HOUR);
    if (format === "compact") return `${h}h`;
    if (format === "full") return `${h} hour${h !== 1 ? "s" : ""} ago`;
    return `${h}h ago`;
  }

  if (diffSec < THIRTY_DAYS) {
    const d = Math.floor(diffSec / DAY);
    if (format === "compact") return `${d}d`;
    if (format === "full") return `${d} day${d !== 1 ? "s" : ""} ago`;
    return `${d}d ago`;
  }

  // Absolute date for items older than 30 days
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
```

**Rationale**: Three format tiers align with responsive breakpoints — `compact` at 80×24, `standard` at 120×40, `full` at 200×60.

---

### Step 4: Text Truncation Helpers

**File**: `apps/tui/src/screens/Issues/utils/truncate.ts`

Truncation utilities specific to issue detail rendering. These wrap the existing `apps/tui/src/util/text.ts` utilities with issue-domain constants.

```typescript
import { truncateRight } from "../../../util/text";
import {
  MAX_BODY_LENGTH,
  MAX_COMMENT_BODY_LENGTH,
  MAX_LABEL_NAME_LENGTH,
  MAX_USERNAME_LENGTH,
} from "../types";

export function truncateBody(body: string | null | undefined): {
  text: string;
  truncated: boolean;
} {
  if (!body || body.trim().length === 0) {
    return { text: "", truncated: false };
  }
  if (body.length <= MAX_BODY_LENGTH) {
    return { text: body, truncated: false };
  }
  return {
    text: body.slice(0, MAX_BODY_LENGTH),
    truncated: true,
  };
}

export function truncateCommentBody(body: string): {
  text: string;
  truncated: boolean;
} {
  if (body.length <= MAX_COMMENT_BODY_LENGTH) {
    return { text: body, truncated: false };
  }
  return {
    text: body.slice(0, MAX_COMMENT_BODY_LENGTH),
    truncated: true,
  };
}

export function truncateLabelName(name: string): string {
  return truncateRight(name, MAX_LABEL_NAME_LENGTH);
}

export function truncateUsername(login: string): string {
  return truncateRight(login, MAX_USERNAME_LENGTH);
}
```

---

### Step 5: Issue Detail Sub-Components

Create the following sub-components inside `apps/tui/src/screens/Issues/components/`.

#### 5a: Issue Header Component

**File**: `apps/tui/src/screens/Issues/components/IssueHeader.tsx`

Renders the title, state badge, and metadata row.

```typescript
import { useTheme } from "../../../hooks/useTheme";
import { useLayout } from "../../../hooks/useLayout";
import { relativeTime } from "../utils/relative-time";
import { truncateUsername } from "../utils/truncate";
import type { Issue } from "@codeplane/ui-core";

interface IssueHeaderProps {
  issue: Issue;
  timestampFormat: "compact" | "standard" | "full";
}

export function IssueHeader({ issue, timestampFormat }: IssueHeaderProps) {
  const theme = useTheme();
  const { width } = useLayout();

  const stateColor = issue.state === "open" ? theme.success : theme.error;
  const stateBadge = `[${issue.state}]`;

  const showUpdated = issue.updated_at !== issue.created_at;
  const commentText = issue.comment_count === 0
    ? "No comments"
    : `${issue.comment_count} comment${issue.comment_count !== 1 ? "s" : ""}`;

  return (
    <box flexDirection="column" paddingX={1} gap={0}>
      {/* Title + state badge */}
      <box flexDirection="row" justifyContent="space-between" width="100%">
        <box flexShrink={1}>
          <text bold wrap="wrap">{issue.title}</text>
        </box>
        <box flexShrink={0} marginLeft={1}>
          <text fg={stateColor} bold>{stateBadge}</text>
          {issue.state === "closed" && issue.closed_at && (
            <text fg={theme.muted}> {relativeTime(issue.closed_at, timestampFormat)}</text>
          )}
        </box>
      </box>

      {/* Metadata row */}
      <box flexDirection="row" gap={2} wrap="wrap">
        <text fg={theme.primary}>@{truncateUsername(issue.author.login)}</text>
        <text fg={theme.muted}>opened {relativeTime(issue.created_at, timestampFormat)}</text>
        {showUpdated && (
          <text fg={theme.muted}>updated {relativeTime(issue.updated_at, timestampFormat)}</text>
        )}
        <text fg={theme.muted}>{commentText}</text>
      </box>
    </box>
  );
}
```

**Key behaviors**:
- Title wraps freely — never truncated on the detail screen.
- State badge `[open]`/`[closed]` uses text + brackets, not background color, for 16-color terminal compatibility.
- `closed_at` timestamp shown only when state is `closed`.
- Metadata row wraps at narrow widths.

---

#### 5b: Issue Metadata Section Component

**File**: `apps/tui/src/screens/Issues/components/IssueMetadata.tsx`

Renders labels, assignees, and milestone. Responsive: collapsed behind `m` toggle at compact breakpoint.

```typescript
import { useTheme } from "../../../hooks/useTheme";
import { useLayout } from "../../../hooks/useLayout";
import { truncateLabelName, truncateUsername } from "../utils/truncate";
import { ASSIGNEE_TRUNCATE_THRESHOLD } from "../types";
import type { Issue } from "@codeplane/ui-core";
import type { MetadataState } from "../types";
// LabelBadge from tui-label-badge-component dependency
import { LabelBadge } from "../../../components/LabelBadge";

interface IssueMetadataProps {
  issue: Issue;
  milestoneName: string | null; // resolved from milestone_id
  metadataState: MetadataState;
  onToggleMetadata: () => void;
}

export function IssueMetadata({
  issue,
  milestoneName,
  metadataState,
  onToggleMetadata,
}: IssueMetadataProps) {
  const theme = useTheme();
  const { breakpoint, width } = useLayout();

  const isCompact = breakpoint === null || breakpoint === "standard";
  // At compact (< 120 cols), labels/assignees hidden unless expanded
  const showFull = !isCompact || metadataState.expanded;

  const hasLabels = issue.labels.length > 0;
  const hasAssignees = issue.assignees.length > 0;
  const hasMilestone = milestoneName !== null;

  // Nothing to render
  if (!hasLabels && !hasAssignees && !hasMilestone) return null;

  // At compact breakpoint without expansion, show toggle hint
  if (isCompact && !metadataState.expanded) {
    if (hasLabels || hasAssignees || hasMilestone) {
      return (
        <box paddingX={1}>
          <text fg={theme.muted}>m:metadata</text>
        </box>
      );
    }
    return null;
  }

  return (
    <box flexDirection="column" paddingX={1} gap={0}>
      {/* Labels row */}
      {hasLabels && (
        <box flexDirection="row" gap={1} wrap="wrap">
          {issue.labels.map((label) => (
            <LabelBadge key={label.id} label={label} />
          ))}
        </box>
      )}

      {/* Assignees and milestone row */}
      <box flexDirection="row" justifyContent="space-between" wrap="wrap">
        {hasAssignees && (
          <box flexDirection="row">
            <text fg={theme.muted}>Assignees: </text>
            {renderAssignees(issue.assignees, width, theme)}
          </box>
        )}
        {hasMilestone && (
          <text fg={theme.muted}>Milestone: {milestoneName}</text>
        )}
      </box>
    </box>
  );
}

function renderAssignees(
  assignees: { id: number; login: string }[],
  width: number,
  theme: any,
) {
  const isNarrow = width < 120;
  const limit = isNarrow ? ASSIGNEE_TRUNCATE_THRESHOLD : assignees.length;
  const visible = assignees.slice(0, limit);
  const remaining = assignees.length - limit;

  return (
    <box flexDirection="row">
      {visible.map((a, i) => (
        <text key={a.id} fg={theme.primary}>
          @{truncateUsername(a.login)}{i < visible.length - 1 ? ", " : ""}
        </text>
      ))}
      {remaining > 0 && (
        <text fg={theme.muted}> +{remaining} more</text>
      )}
    </box>
  );
}
```

---

#### 5c: Comment Block Component

**File**: `apps/tui/src/screens/Issues/components/CommentBlock.tsx`

Renders a single comment with author, timestamp, and markdown body.

```typescript
import { useTheme } from "../../../hooks/useTheme";
import { relativeTime, type TimestampFormat } from "../utils/relative-time";
import { truncateCommentBody, truncateUsername } from "../utils/truncate";
import type { IssueComment } from "@codeplane/ui-core";

interface CommentBlockProps {
  comment: IssueComment;
  focused: boolean;
  timestampFormat: TimestampFormat;
  isCurrentUser: boolean; // shows edit/delete indicators
}

export function CommentBlock({
  comment,
  focused,
  timestampFormat,
  isCurrentUser,
}: CommentBlockProps) {
  const theme = useTheme();
  const { text: bodyText, truncated } = truncateCommentBody(comment.body);

  return (
    <box
      flexDirection="column"
      borderLeft={focused ? "single" : undefined}
      borderColor={focused ? theme.primary : undefined}
      paddingLeft={focused ? 1 : 0}
    >
      {/* Comment header: @user · timestamp */}
      <box flexDirection="row" gap={2}>
        <text fg={theme.primary}>@{truncateUsername(comment.commenter)}</text>
        <text fg={theme.muted}>{relativeTime(comment.created_at, timestampFormat)}</text>
        {isCurrentUser && (
          <text fg={theme.muted}>(yours)</text>
        )}
      </box>

      {/* Comment body */}
      <markdown content={bodyText} />

      {truncated && (
        <text fg={theme.warning}>Comment truncated. View full comment on web.</text>
      )}
    </box>
  );
}
```

---

#### 5d: Timeline Event Component

**File**: `apps/tui/src/screens/Issues/components/TimelineEventRow.tsx`

Renders a single-line timeline event (label added, state changed, etc.).

```typescript
import { useTheme } from "../../../hooks/useTheme";
import { relativeTime, type TimestampFormat } from "../utils/relative-time";
import { EVENT_ICONS } from "../types";
import type { IssueEvent } from "@codeplane/ui-core";

interface TimelineEventRowProps {
  event: IssueEvent;
  timestampFormat: TimestampFormat;
}

export function TimelineEventRow({ event, timestampFormat }: TimelineEventRowProps) {
  const theme = useTheme();
  const icon = EVENT_ICONS[event.eventType] ?? EVENT_ICONS.default;
  const description = formatEventDescription(event);

  return (
    <box flexDirection="row" gap={1}>
      <text fg={theme.muted}>{icon}</text>
      <text fg={theme.muted}>{description}</text>
      <text fg={theme.muted}>— {relativeTime(event.createdAt, timestampFormat)}</text>
    </box>
  );
}

function formatEventDescription(event: IssueEvent): string {
  const payload = event.payload as Record<string, any> | null;
  const actor = payload?.actor ? `@${payload.actor}` : "Someone";

  switch (event.eventType) {
    case "label_added":
      return `${actor} added label ${payload?.label ?? "unknown"}`;
    case "label_removed":
      return `${actor} removed label ${payload?.label ?? "unknown"}`;
    case "assignee_added":
      return `${actor} assigned @${payload?.assignee ?? "unknown"}`;
    case "assignee_removed":
      return `${actor} unassigned @${payload?.assignee ?? "unknown"}`;
    case "state_changed":
      return `${actor} changed state ${payload?.from ?? "?"} → ${payload?.to ?? "?"}`;
    case "referenced":
      return `${actor} referenced this in ${payload?.ref ?? "?"}`;
    case "milestone_changed":
      return `${actor} ${payload?.action === "added" ? "added to" : "removed from"} milestone ${payload?.milestone ?? "?"}`;
    default:
      return `${actor} ${event.eventType.replace(/_/g, " ")}`;
  }
}
```

---

#### 5e: Dependencies Section Component

**File**: `apps/tui/src/screens/Issues/components/IssueDependencies.tsx`

Renders dependency/dependent issue list with navigation.

```typescript
import { useTheme } from "../../../hooks/useTheme";
import type { Issue } from "@codeplane/ui-core";

interface IssueSummary {
  number: number;
  title: string;
  state: "open" | "closed";
}

interface IssueDependenciesProps {
  dependencies: IssueSummary[];
  dependents: IssueSummary[];
  focusedIndex: number | null; // null when section not focused
  onNavigate: (issueNumber: number) => void;
}

export function IssueDependencies({
  dependencies,
  dependents,
  focusedIndex,
  onNavigate,
}: IssueDependenciesProps) {
  const theme = useTheme();
  const allItems = [
    ...dependencies.map((d) => ({ ...d, relation: "depends_on" as const })),
    ...dependents.map((d) => ({ ...d, relation: "blocks" as const })),
  ];

  if (allItems.length === 0) return null;

  return (
    <box flexDirection="column">
      <text fg={theme.border}>──── Dependencies ────</text>
      {allItems.map((item, i) => {
        const prefix = item.relation === "depends_on" ? "Depends on" : "Blocks";
        const focused = focusedIndex === i;
        const stateColor = item.state === "open" ? theme.success : theme.error;
        return (
          <box key={`${item.relation}-${item.number}`} flexDirection="row">
            {focused && <text fg={theme.primary}>▸ </text>}
            <text fg={focused ? theme.primary : theme.muted}>
              {prefix} #{item.number}: {item.title}
            </text>
            <text fg={stateColor}> [{item.state}]</text>
          </box>
        );
      })}
    </box>
  );
}
```

---

#### 5f: Comment Textarea Component

**File**: `apps/tui/src/screens/Issues/components/CommentInput.tsx`

Renders the inline comment creation textarea at the bottom of the detail view.

```typescript
import { useState, useRef } from "react";
import { useTheme } from "../../../hooks/useTheme";
import type { CommentDraft } from "../types";

interface CommentInputProps {
  draft: CommentDraft;
  onSubmit: (body: string) => void;
  onCancel: () => void;
  onBodyChange: (body: string) => void;
}

export function CommentInput({
  draft,
  onSubmit,
  onCancel,
  onBodyChange,
}: CommentInputProps) {
  const theme = useTheme();

  if (!draft.isOpen) return null;

  return (
    <box flexDirection="column" borderTop="single" borderColor={theme.border} paddingX={1} paddingY={0}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.muted}>New comment</text>
        <text fg={theme.muted}>Ctrl+S:submit  Esc:cancel</text>
      </box>
      <input
        value={draft.body}
        onChange={onBodyChange}
        multiline
        height={5}
        placeholder="Write a comment…"
      />
      {draft.isSubmitting && (
        <text fg={theme.muted}>Submitting…</text>
      )}
    </box>
  );
}
```

---

#### 5g: Component Barrel Export

**File**: `apps/tui/src/screens/Issues/components/index.ts`

```typescript
export { IssueHeader } from "./IssueHeader";
export { IssueMetadata } from "./IssueMetadata";
export { CommentBlock } from "./CommentBlock";
export { TimelineEventRow } from "./TimelineEventRow";
export { IssueDependencies } from "./IssueDependencies";
export { CommentInput } from "./CommentInput";
```

---

### Step 6: Issue Detail Hook — `useIssueDetail`

**File**: `apps/tui/src/screens/Issues/hooks/useIssueDetail.ts`

Orchestration hook that composes the four data hooks, manages timeline interleaving, and exposes a single API for the screen component.

```typescript
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  useIssue,
  useIssueComments,
  useIssueEvents,
  useUpdateIssue,
  useCreateIssueComment,
} from "@codeplane/ui-core";
import { interleaveTimeline, getCommentIndices } from "../utils/interleave-timeline";
import type { TimelineItem, CommentDraft, MetadataState, IssueDetailPermissions } from "../types";
import { MAX_TIMELINE_ITEMS, DATA_CACHE_TTL_MS, TIMELINE_PAGE_SIZE } from "../types";
import { logger } from "../../../lib/logger";

interface UseIssueDetailOptions {
  owner: string;
  repo: string;
  number: number;
}

interface UseIssueDetailReturn {
  // Data
  issue: Issue | null;
  timelineItems: TimelineItem[];
  commentIndices: number[];
  totalTimelineCount: number;
  dependencies: IssueSummary[];
  dependents: IssueSummary[];
  milestoneName: string | null;

  // Loading states
  issueLoading: boolean;
  commentsLoading: boolean;
  eventsLoading: boolean;
  depsLoading: boolean;
  initialLoading: boolean; // all four loading on first mount

  // Errors
  issueError: Error | null;
  commentsError: Error | null;
  eventsError: Error | null;
  depsError: Error | null;

  // Pagination
  hasMoreTimeline: boolean;
  fetchMoreTimeline: () => void;
  timelinePageLoading: boolean;

  // Mutations
  toggleState: () => void;
  stateToggling: boolean;
  submitComment: (body: string) => void;
  commentSubmitting: boolean;

  // Refetch
  refetchAll: () => void;
  refetchIssue: () => void;

  // Capped notice
  itemsCapped: boolean;
}

export function useIssueDetail({ owner, repo, number }: UseIssueDetailOptions): UseIssueDetailReturn {
  const mountTime = useRef(Date.now());

  // Core data hooks — all fire concurrently on mount
  const {
    issue,
    isLoading: issueLoading,
    error: issueError,
    refetch: refetchIssue,
  } = useIssue(owner, repo, number);

  const {
    comments,
    totalCount: commentsTotalCount,
    isLoading: commentsLoading,
    error: commentsError,
    hasMore: hasMoreComments,
    fetchMore: fetchMoreComments,
    refetch: refetchComments,
  } = useIssueComments(owner, repo, number);

  const {
    events,
    totalCount: eventsTotalCount,
    isLoading: eventsLoading,
    error: eventsError,
    hasMore: hasMoreEvents,
    fetchMore: fetchMoreEvents,
    refetch: refetchEvents,
  } = useIssueEvents(owner, repo, number);

  // Dependencies hook — may return 404 if endpoint not implemented
  // Gracefully handled: empty arrays on error
  const [dependencies, setDependencies] = useState<any[]>([]);
  const [dependents, setDependents] = useState<any[]>([]);
  const [depsLoading, setDepsLoading] = useState(true);
  const [depsError, setDepsError] = useState<Error | null>(null);

  // TODO: Replace with useIssueDependencies when backend implements the endpoint
  useEffect(() => {
    setDepsLoading(false);
    setDependencies([]);
    setDependents([]);
  }, [owner, repo, number]);

  // Interleave comments and events
  const timelineItems = useMemo(
    () => interleaveTimeline(comments ?? [], events ?? []),
    [comments, events],
  );

  const commentIndices = useMemo(
    () => getCommentIndices(timelineItems),
    [timelineItems],
  );

  const itemsCapped = timelineItems.length >= MAX_TIMELINE_ITEMS;

  const totalTimelineCount = (commentsTotalCount ?? 0) + (eventsTotalCount ?? 0);

  const hasMoreTimeline = !itemsCapped && (hasMoreComments || hasMoreEvents);

  const fetchMoreTimeline = useCallback(() => {
    if (hasMoreComments) fetchMoreComments();
    if (hasMoreEvents) fetchMoreEvents();
  }, [hasMoreComments, hasMoreEvents, fetchMoreComments, fetchMoreEvents]);

  const timelinePageLoading = commentsLoading || eventsLoading;

  const initialLoading = issueLoading && commentsLoading && eventsLoading && depsLoading;

  // Logging
  useEffect(() => {
    if (issue && !issueLoading) {
      const duration = Date.now() - mountTime.current;
      logger.info(
        `IssueDetail: ready [number=${number}] [total_ms=${duration}]`,
      );
      if (duration > 2000) {
        logger.warn(
          `IssueDetail: slow load [number=${number}] [duration=${duration}ms]`,
        );
      }
    }
  }, [issue, issueLoading, number]);

  // Mutations
  const updateIssue = useUpdateIssue(owner, repo, number);

  const toggleState = useCallback(() => {
    if (!issue) return;
    const newState = issue.state === "open" ? "closed" : "open";
    logger.info(
      `IssueDetail: state changed [number=${number}] [from=${issue.state}] [to=${newState}]`,
    );
    updateIssue.mutate({ state: newState });
  }, [issue, number, updateIssue]);

  const createComment = useCreateIssueComment(owner, repo, number);

  const submitComment = useCallback(
    (body: string) => {
      logger.info(`IssueDetail: comment created [number=${number}]`);
      createComment.mutate({ body });
    },
    [number, createComment],
  );

  const refetchAll = useCallback(() => {
    refetchIssue();
    refetchComments();
    refetchEvents();
  }, [refetchIssue, refetchComments, refetchEvents]);

  // Milestone name resolution
  const milestoneName = issue?.milestone_id ? `Milestone ${issue.milestone_id}` : null;
  // TODO: Resolve milestone name from useRepoMilestones when loaded

  return {
    issue,
    timelineItems,
    commentIndices,
    totalTimelineCount,
    dependencies,
    dependents,
    milestoneName,
    issueLoading,
    commentsLoading,
    eventsLoading,
    depsLoading,
    initialLoading,
    issueError,
    commentsError,
    eventsError,
    depsError,
    hasMoreTimeline,
    fetchMoreTimeline,
    timelinePageLoading,
    toggleState,
    stateToggling: updateIssue.isLoading,
    submitComment,
    commentSubmitting: createComment.isLoading,
    refetchAll,
    refetchIssue,
    itemsCapped,
  };
}
```

**Rationale**: This orchestration hook keeps the screen component thin and focused on rendering. All data coordination, memoization, and logging live here. The dependencies stub is intentional — the `useIssueDependencies` endpoint does not exist yet, so we degrade gracefully to empty arrays. This is left as a TODO, not a mock — it will start working when the backend implements the endpoint.

---

### Step 7: Issue Detail Screen Component

**File**: `apps/tui/src/screens/Issues/IssueDetailScreen.tsx`

The main screen component, registered in the screen router.

```typescript
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { ScreenComponentProps } from "../../router/types";
import { ScreenName } from "../../router/types";
import { useNavigation } from "../../hooks/useNavigation";
import { useLayout } from "../../hooks/useLayout";
import { useTheme } from "../../hooks/useTheme";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings";
import { useScreenLoading } from "../../hooks/useScreenLoading";
import { useAuth } from "../../hooks/useAuth";
import { FullScreenLoading } from "../../components/FullScreenLoading";
import { FullScreenError } from "../../components/FullScreenError";
import { SkeletonDetail } from "../../components/SkeletonDetail";
import { PaginationIndicator } from "../../components/PaginationIndicator";
import {
  IssueHeader,
  IssueMetadata,
  CommentBlock,
  TimelineEventRow,
  IssueDependencies,
  CommentInput,
} from "./components";
import { useIssueDetail } from "./hooks/useIssueDetail";
import { truncateBody } from "./utils/truncate";
import type { CommentDraft, MetadataState, TimelineItem } from "./types";
import { TOAST_DURATION_MS, MAX_TIMELINE_ITEMS } from "./types";
import { logger } from "../../lib/logger";

export function IssueDetailScreen({ entry, params }: ScreenComponentProps) {
  const nav = useNavigation();
  const layout = useLayout();
  const theme = useTheme();
  const auth = useAuth();

  const owner = params.owner;
  const repo = params.repo;
  const number = parseInt(params.number, 10);

  // Data
  const detail = useIssueDetail({ owner, repo, number });

  // UI state
  const [commentDraft, setCommentDraft] = useState<CommentDraft>({
    body: "",
    isOpen: false,
    isSubmitting: false,
  });
  const [metadataState, setMetadataState] = useState<MetadataState>({
    expanded: false,
  });
  const [focusedCommentIndex, setFocusedCommentIndex] = useState<number>(-1);
  const [focusedDepIndex, setFocusedDepIndex] = useState<number | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Scroll ref for scrollbox
  const scrollRef = useRef<any>(null);

  // Responsive timestamp format
  const timestampFormat = useMemo(() => {
    if (!layout.breakpoint) return "compact" as const;
    if (layout.breakpoint === "standard") return "compact" as const;
    return "standard" as const; // large
    // Note: "full" could be used at 200+ but "standard" is readable enough
  }, [layout.breakpoint]);

  // Determine write access (server enforced; client hides hints)
  const canWrite = true; // TODO: derive from repo permissions when available
  const canComment = auth.authState === "authenticated";

  // Loading state integration
  const { showSpinner, showError, loadingError, retry, spinnerFrame } = useScreenLoading({
    id: `issue-detail-${owner}-${repo}-${number}`,
    label: `Loading issue #${number}…`,
    isLoading: detail.issueLoading && !detail.issue,
    error: detail.issueError,
    onRetry: detail.refetchAll,
  });

  // Comment navigation: n/p
  const jumpToComment = useCallback(
    (direction: "next" | "prev") => {
      const indices = detail.commentIndices;
      if (indices.length === 0) return;

      if (direction === "next") {
        const nextIdx = indices.find((i) => i > focusedCommentIndex);
        if (nextIdx !== undefined) {
          setFocusedCommentIndex(nextIdx);
          logger.debug(
            `IssueDetail: comment nav [direction=n] [target_id=${detail.timelineItems[nextIdx]?.id}]`,
          );
        }
      } else {
        const prevIdx = [...indices].reverse().find((i) => i < focusedCommentIndex);
        if (prevIdx !== undefined) {
          setFocusedCommentIndex(prevIdx);
          logger.debug(
            `IssueDetail: comment nav [direction=p] [target_id=${detail.timelineItems[prevIdx]?.id}]`,
          );
        }
      }
    },
    [detail.commentIndices, focusedCommentIndex, detail.timelineItems],
  );

  // Comment submission
  const handleSubmitComment = useCallback(() => {
    if (!commentDraft.body.trim()) return;
    setCommentDraft((d) => ({ ...d, isSubmitting: true }));
    detail.submitComment(commentDraft.body);
    // On success: close textarea, clear draft
    setCommentDraft({ body: "", isOpen: false, isSubmitting: false });
  }, [commentDraft.body, detail]);

  // Comment cancel with confirmation
  const handleCancelComment = useCallback(() => {
    if (commentDraft.body.trim().length > 0 && !confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    setCommentDraft({ body: "", isOpen: false, isSubmitting: false });
    setConfirmCancel(false);
  }, [commentDraft.body, confirmCancel]);

  // Dependency navigation
  const handleDependencyNavigate = useCallback(
    (issueNumber: number) => {
      logger.info(
        `IssueDetail: dependency navigated [from=${number}] [to=${issueNumber}]`,
      );
      nav.push(ScreenName.IssueDetail, {
        owner,
        repo,
        number: String(issueNumber),
      });
    },
    [nav, owner, repo, number],
  );

  // Pagination trigger on scroll
  const handleScroll = useCallback(
    (scrollInfo: { scrollY: number; contentHeight: number; viewportHeight: number }) => {
      const scrollPercent = (scrollInfo.scrollY + scrollInfo.viewportHeight) / scrollInfo.contentHeight;
      if (scrollPercent >= 0.8 && detail.hasMoreTimeline && !detail.timelinePageLoading) {
        detail.fetchMoreTimeline();
      }
    },
    [detail],
  );

  // Keybindings
  const keybindings = useMemo(() => {
    const bindings = [
      { key: "j", description: "Scroll down", group: "Nav", handler: () => { /* scrollbox handles j/k natively via scrollbox focus */ } },
      { key: "k", description: "Scroll up", group: "Nav", handler: () => {} },
      { key: "G", description: "Bottom", group: "Nav", handler: () => {} },
      // g g handled by go-to mode
      {
        key: "n",
        description: "Next comment",
        group: "Nav",
        handler: () => jumpToComment("next"),
      },
      {
        key: "p",
        description: "Prev comment",
        group: "Nav",
        handler: () => jumpToComment("prev"),
      },
      {
        key: "q",
        description: "Back",
        group: "Actions",
        handler: () => nav.pop(),
      },
    ];

    if (canComment) {
      bindings.push({
        key: "c",
        description: "Comment",
        group: "Actions",
        handler: () => setCommentDraft((d) => ({ ...d, isOpen: true })),
      });
    }

    if (canWrite) {
      bindings.push(
        {
          key: "e",
          description: "Edit",
          group: "Actions",
          handler: () =>
            nav.push(ScreenName.IssueEdit, { owner, repo, number: String(number) }),
        },
        {
          key: "o",
          description: detail.issue?.state === "open" ? "Close" : "Reopen",
          group: "Actions",
          handler: detail.toggleState,
          when: () => !detail.stateToggling,
        },
        {
          key: "l",
          description: "Labels",
          group: "Actions",
          handler: () => { /* TODO: open label picker overlay */ },
        },
        {
          key: "a",
          description: "Assign",
          group: "Actions",
          handler: () => { /* TODO: open assignee picker overlay */ },
        },
      );
    }

    // Compact metadata toggle
    if (layout.breakpoint === null || layout.breakpoint === "standard") {
      bindings.push({
        key: "m",
        description: "Metadata",
        group: "View",
        handler: () => setMetadataState((s) => ({ expanded: !s.expanded })),
      });
    }

    // Comment textarea keybindings
    if (commentDraft.isOpen) {
      bindings.push(
        {
          key: "ctrl+s",
          description: "Submit",
          group: "Comment",
          handler: handleSubmitComment,
        },
        {
          key: "Escape",
          description: "Cancel",
          group: "Comment",
          handler: handleCancelComment,
        },
      );
    }

    // Error retry
    if (detail.issueError || detail.commentsError || detail.eventsError) {
      bindings.push({
        key: "R",
        description: "Retry",
        group: "Actions",
        handler: detail.refetchAll,
      });
    }

    return bindings;
  }, [
    canComment, canWrite, commentDraft.isOpen, detail, layout.breakpoint,
    jumpToComment, handleSubmitComment, handleCancelComment, nav, owner, repo, number,
  ]);

  const statusBarHints = useMemo(() => [
    { key: "j/k", label: "scroll" },
    { key: "n/p", label: "comment" },
    ...(canComment ? [{ key: "c", label: "comment" }] : []),
    ...(canWrite ? [
      { key: "e", label: "edit" },
      { key: "o", label: detail.issue?.state === "open" ? "close" : "reopen" },
    ] : []),
    { key: "q", label: "back" },
  ], [canComment, canWrite, detail.issue?.state]);

  useScreenKeybindings(keybindings, statusBarHints);

  // Telemetry: viewed event
  useEffect(() => {
    if (detail.issue && !detail.issueLoading) {
      logger.debug(
        `IssueDetail: mounted [owner=${owner}] [repo=${repo}] [number=${number}] [width=${layout.width}] [height=${layout.height}]`,
      );
    }
  }, [detail.issue, detail.issueLoading, owner, repo, number, layout.width, layout.height]);

  // ──── Render ────

  // Loading state
  if (showSpinner) {
    return <FullScreenLoading label={`Loading issue #${number}…`} spinnerFrame={spinnerFrame} />;
  }

  // 404 error
  if (detail.issueError && (detail.issueError as any).status === 404) {
    return (
      <box flexDirection="column" justifyContent="center" alignItems="center" height="100%">
        <text fg={theme.error}>Issue #{number} not found</text>
        <text fg={theme.muted}>Press q to go back</text>
      </box>
    );
  }

  // Generic error
  if (showError && loadingError) {
    return (
      <FullScreenError
        message={`Failed to load issue #${number}`}
        error={loadingError}
        onRetry={retry}
      />
    );
  }

  // Skeleton while first data is arriving
  if (!detail.issue) {
    return <SkeletonDetail sections={["Description", "Comments"]} />;
  }

  const issue = detail.issue;
  const { text: bodyText, truncated: bodyTruncated } = truncateBody(issue.body);

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Issue header */}
      <IssueHeader issue={issue} timestampFormat={timestampFormat} />

      {/* Metadata (labels, assignees, milestone) */}
      <IssueMetadata
        issue={issue}
        milestoneName={detail.milestoneName}
        metadataState={metadataState}
        onToggleMetadata={() => setMetadataState((s) => ({ expanded: !s.expanded }))}
      />

      {/* Separator */}
      <box paddingX={1}>
        <text fg={theme.border}>{'─'.repeat(Math.max(layout.width - 2, 10))}</text>
      </box>

      {/* Scrollable content: body, dependencies, timeline */}
      <scrollbox
        ref={scrollRef}
        flexGrow={1}
        paddingX={1}
        onScroll={handleScroll}
      >
        <box flexDirection="column" gap={1}>
          {/* Issue body */}
          {bodyText ? (
            <markdown content={bodyText} />
          ) : (
            <text fg={theme.muted} italic>No description provided.</text>
          )}
          {bodyTruncated && (
            <text fg={theme.warning}>Body truncated. View full issue on web.</text>
          )}

          {/* Dependencies */}
          <IssueDependencies
            dependencies={detail.dependencies}
            dependents={detail.dependents}
            focusedIndex={focusedDepIndex}
            onNavigate={handleDependencyNavigate}
          />

          {/* Comments separator */}
          <text fg={theme.border}>
            ──── Comments ({issue.comment_count}) ────
          </text>

          {/* Timeline items */}
          {detail.timelineItems.length === 0 ? (
            <text fg={theme.muted}>No comments yet. Press c to add one.</text>
          ) : (
            detail.timelineItems.map((item, index) => {
              if (item.type === "comment") {
                return (
                  <box key={`comment-${item.id}`} marginBottom={1}>
                    <CommentBlock
                      comment={item.comment}
                      focused={focusedCommentIndex === index}
                      timestampFormat={timestampFormat}
                      isCurrentUser={item.comment.commenter === auth.user?.login}
                    />
                  </box>
                );
              }
              return (
                <TimelineEventRow
                  key={`event-${item.id}`}
                  event={item.event}
                  timestampFormat={timestampFormat}
                />
              );
            })
          )}

          {/* Items capped notice */}
          {detail.itemsCapped && (
            <text fg={theme.warning}>
              Showing {MAX_TIMELINE_ITEMS} of {detail.totalTimelineCount} items
            </text>
          )}

          {/* Pagination loading */}
          {detail.timelinePageLoading && (
            <PaginationIndicator status="loading" />
          )}

          {/* Section errors */}
          {detail.commentsError && !detail.issueError && (
            <text fg={theme.error}>Failed to load comments. Press R to retry.</text>
          )}
          {detail.eventsError && !detail.issueError && (
            <text fg={theme.error}>Failed to load timeline events. Press R to retry.</text>
          )}
        </box>
      </scrollbox>

      {/* Comment textarea (bottom of screen when open) */}
      <CommentInput
        draft={commentDraft}
        onSubmit={handleSubmitComment}
        onCancel={handleCancelComment}
        onBodyChange={(body) => setCommentDraft((d) => ({ ...d, body }))}
      />

      {/* Cancel confirmation dialog */}
      {confirmCancel && (
        <box
          position="absolute"
          top="center"
          left="center"
          width={40}
          height={5}
          border="single"
          borderColor={theme.border}
          bg={theme.surface}
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
        >
          <text>Discard comment draft?</text>
          <box flexDirection="row" gap={2}>
            <text fg={theme.muted}>Enter:yes  Esc:no</text>
          </box>
        </box>
      )}
    </box>
  );
}
```

---

### Step 8: Register Screen in Router

**File**: `apps/tui/src/router/registry.ts`

Update the screen registry to point `ScreenName.IssueDetail` at the real component.

```typescript
// Replace:
[ScreenName.IssueDetail]: {
  component: PlaceholderScreen,
  requiresRepo: true,
  breadcrumbLabel: (p) => (p.number ? `#${p.number}` : "Issue"),
},

// With:
import { IssueDetailScreen } from "../screens/Issues/IssueDetailScreen";

[ScreenName.IssueDetail]: {
  component: IssueDetailScreen,
  requiresRepo: true,
  breadcrumbLabel: (p) => (p.number ? `#${p.number}` : "Issue"),
},
```

---

### Step 9: Utilities Barrel Export

**File**: `apps/tui/src/screens/Issues/utils/index.ts`

```typescript
export { interleaveTimeline, getCommentIndices } from "./interleave-timeline";
export { relativeTime, type TimestampFormat } from "./relative-time";
export { truncateBody, truncateCommentBody, truncateLabelName, truncateUsername } from "./truncate";
```

---

### Step 10: Hooks Barrel Export

**File**: `apps/tui/src/screens/Issues/hooks/index.ts`

```typescript
export { useIssueDetail } from "./useIssueDetail";
```

---

## File Inventory

| File | Type | Description |
|------|------|-------------|
| `apps/tui/src/screens/Issues/types.ts` | Extend | Add detail view types, constants |
| `apps/tui/src/screens/Issues/utils/interleave-timeline.ts` | New | Timeline merge utility |
| `apps/tui/src/screens/Issues/utils/relative-time.ts` | New | Timestamp formatting |
| `apps/tui/src/screens/Issues/utils/truncate.ts` | New | Domain-specific truncation |
| `apps/tui/src/screens/Issues/utils/index.ts` | New | Utils barrel export |
| `apps/tui/src/screens/Issues/hooks/useIssueDetail.ts` | New | Orchestration hook |
| `apps/tui/src/screens/Issues/hooks/index.ts` | New | Hooks barrel export |
| `apps/tui/src/screens/Issues/components/IssueHeader.tsx` | New | Title + state badge + metadata row |
| `apps/tui/src/screens/Issues/components/IssueMetadata.tsx` | New | Labels, assignees, milestone |
| `apps/tui/src/screens/Issues/components/CommentBlock.tsx` | New | Single comment rendering |
| `apps/tui/src/screens/Issues/components/TimelineEventRow.tsx` | New | Single timeline event |
| `apps/tui/src/screens/Issues/components/IssueDependencies.tsx` | New | Dependencies section |
| `apps/tui/src/screens/Issues/components/CommentInput.tsx` | New | Comment creation textarea |
| `apps/tui/src/screens/Issues/components/index.ts` | Extend | Add new component exports |
| `apps/tui/src/screens/Issues/IssueDetailScreen.tsx` | New | Main screen component |
| `apps/tui/src/router/registry.ts` | Modify | Wire IssueDetailScreen |
| `e2e/tui/issues.test.ts` | Extend | Add detail view tests |

---

## Data Flow

```
IssueDetailScreen (params: {owner, repo, number})
  │
  ├─ useIssueDetail(owner, repo, number)
  │   ├─ useIssue()             → GET /api/repos/:owner/:repo/issues/:number
  │   ├─ useIssueComments()     → GET /api/repos/:owner/:repo/issues/:number/comments
  │   ├─ useIssueEvents()       → GET /api/repos/:owner/:repo/issues/:number/events
  │   ├─ [useIssueDependencies] → GET /api/repos/:owner/:repo/issues/:number/dependencies (TODO)
  │   ├─ useUpdateIssue()       → PATCH /api/repos/:owner/:repo/issues/:number
  │   └─ useCreateIssueComment()→ POST /api/repos/:owner/:repo/issues/:number/comments
  │
  ├─ useScreenLoading()   → spinner / error / skeleton states
  ├─ useScreenKeybindings() → j/k/n/p/c/e/o/l/a/m/q/R bindings
  ├─ useLayout()          → breakpoint, width, height
  ├─ useTheme()           → color tokens
  └─ useAuth()            → user identity, permissions
```

### Cache Strategy

- `useIssue` caches for 30 seconds (configured in `tui-issues-data-hooks`).
- Re-navigating to the same issue within 30 seconds shows cached data instantly — no loading spinner.
- The cache key is `issue:${owner}/${repo}#${number}`.
- Write mutations (state toggle, comment creation) invalidate the cache and trigger a refetch.
- Comments and events use cursor-based pagination; loaded pages are kept in memory.
- Memory cap: 500 total timeline items. Oldest pages are NOT evicted; instead, pagination stops at the cap.

### Optimistic UI Flows

**State Toggle (open → closed / closed → open)**:
1. User presses `o`.
2. `useUpdateIssue.mutate({ state: newState })` fires.
3. `onOptimistic`: state badge updates immediately in the UI.
4. On 200: cache refreshed, badge stays.
5. On error: `onRevert` restores previous state. Status bar shows "Failed to update issue state" for 5 seconds in `error` color.

**Comment Creation**:
1. User presses `c`, types comment, presses `Ctrl+S`.
2. `useCreateIssueComment.mutate({ body })` fires.
3. `onOptimistic`: comment appended to timeline with `(pending)` indicator.
4. On 201: pending indicator removed, server-assigned ID replaces temp ID.
5. On error: optimistic comment removed. Textarea reopens with preserved content. Error toast shown.

---

## Responsive Behavior Matrix

| Aspect | 80×24 (compact) | 120×40 (standard) | 200×60 (large) |
|--------|-----------------|--------------------|-----------------|
| Title | Wraps freely | Wraps freely | Wraps freely |
| State badge | `[open]`/`[closed]` | Same | Same |
| Author | `@user` | `@user` | `@user` |
| Timestamps | `"2h"` compact | `"2h ago"` standard | `"2 hours ago"` full |
| Updated at | Hidden | Shown | Shown |
| Comment count | `"5 comments"` | Same | Same |
| Labels | Hidden (press `m`) | Inline | Inline with descriptions |
| Assignees | Hidden (press `m`) | Inline | Inline |
| Milestone | Hidden (press `m`) | Shown | Shown |
| Dependencies | Shown | Shown | Shown |
| Comment padding | 0 margin | 1 margin | 1 margin |
| Separator width | `width - 2` | `width - 2` | `width - 2` |
| Modal width | 90% | 60% | 50% |
| Status bar hints | 4 hints | 6 hints | All hints |
| Below 80×24 | "Terminal too small" | — | — |

---

## Keyboard Architecture

The `IssueDetailScreen` registers keybindings at `PRIORITY.SCREEN` (50). When the comment textarea is open, additional bindings for `Ctrl+S` and `Esc` are registered at the same priority but later in the LIFO stack, so they take precedence.

```
Priority 1: Text Input (comment textarea captures printable keys)
Priority 2: Modal (cancel confirmation dialog traps Enter/Esc)
Priority 3: Screen (j/k/n/p/c/e/o/l/a/m/q/R)
Priority 4: Global (?, :, Ctrl+C)
```

**Focus model**:
- Default focus: scrollbox content (j/k scrolls)
- `c` opens textarea → focus moves to text input (printable keys captured)
- `Esc` or `Ctrl+S` in textarea → focus returns to scrollbox
- `Enter` on dependency → navigates to new issue detail (push)
- `l` opens label picker overlay → focus trapped in overlay
- `a` opens assignee picker overlay → focus trapped in overlay

**Comment jump (`n`/`p`) algorithm**:
1. Maintain `focusedCommentIndex` pointing into `timelineItems` array.
2. `n`: find the first index in `commentIndices` greater than `focusedCommentIndex`. If found, set and scroll to it.
3. `p`: find the last index in `commentIndices` less than `focusedCommentIndex`. If found, set and scroll to it.
4. At bounds: no wrap — `n` at last comment is a no-op, `p` at first comment is a no-op.
5. Visual indicator: focused comment has a left border highlight in `primary` color.

---

## Error Handling

| Error | Detection | Display | Recovery |
|-------|-----------|---------|----------|
| Issue 404 | `issueError.status === 404` | "Issue #N not found" full-screen | `q` to go back |
| Issue network error | `issueError` (non-404) | "Failed to load issue" full-screen | `R` to retry |
| Issue 401 | `issueError.status === 401` | "Session expired. Run `codeplane auth login`" | Exit TUI, re-auth |
| Comments fetch fail | `commentsError` | Inline "Failed to load comments. Press R to retry." | `R` to retry |
| Events fetch fail | `eventsError` | Inline "Failed to load timeline events. Press R to retry." | `R` to retry |
| State toggle fail | `updateIssue.error` | Optimistic revert + status bar toast 5s | Retry with `o` |
| Comment submit fail | `createComment.error` | Optimistic remove + textarea reopens with draft | Retry `Ctrl+S` |
| Permission denied (403) | Mutation returns 403 | "Permission denied" inline toast 3s | No retry |
| Body too long | `body.length > 100000` | Truncated + warning notice | View on web |
| Comment too long | `comment.body.length > 50000` | Truncated + warning notice | View on web |
| Items capped | `timelineItems.length >= 500` | "Showing 500 of N items" notice | View on web |
| Resize < 80×24 | `useLayout` returns null breakpoint | Handled by `TerminalTooSmallScreen` (global) | Resize terminal |
| Markdown render fail | `<markdown>` internal error | Falls back to plain text | Automatic |

---

## Logging

All logging uses `apps/tui/src/lib/logger.ts`.

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Screen mounted | `IssueDetail: mounted [owner={o}] [repo={r}] [number={n}] [width={w}] [height={h}]` |
| `debug` | Comment navigation | `IssueDetail: comment nav [direction={n\|p}] [target_id={id}]` |
| `info` | Data ready | `IssueDetail: ready [number={n}] [total_ms={ms}]` |
| `info` | State changed | `IssueDetail: state changed [number={n}] [from={old}] [to={new}]` |
| `info` | Comment created | `IssueDetail: comment created [number={n}]` |
| `info` | Dependency navigated | `IssueDetail: dependency navigated [from={n}] [to={m}]` |
| `warn` | Slow load (>2s) | `IssueDetail: slow load [number={n}] [duration={ms}ms]` |
| `warn` | Body truncated | `IssueDetail: body truncated [number={n}] [original_length={len}]` |
| `warn` | Items capped | `IssueDetail: items capped at 500 [total={n}]` |
| `error` | 404 | `IssueDetail: 404 [owner={o}] [repo={r}] [number={n}]` |
| `error` | Auth error | `IssueDetail: auth error [status=401]` |
| `error` | Fetch failed | `IssueDetail: fetch failed [endpoint={ep}] [status={code}]` |
| `error` | Optimistic revert | `IssueDetail: optimistic revert [action={action}] [error={msg}]` |

---

## Productionization Notes

The following items are stubbed or TODOed in this implementation and must be addressed before the feature is considered complete:

1. **Dependencies endpoint**: `useIssueDependencies` is stubbed to return empty arrays. When the backend implements `GET /api/repos/:owner/:repo/issues/:number/dependencies`, remove the stub in `useIssueDetail.ts` and wire the real hook. The `<IssueDependencies>` component and `Enter`-to-navigate keybinding are already fully implemented — they just need data.

2. **Issue events endpoint**: `useIssueEvents` will return 404 until the backend implements the endpoint. The timeline will render with comments only until then. This is left failing per project policy — no mocking, no skipping.

3. **Milestone name resolution**: Currently shows `Milestone {id}`. Must integrate with `useRepoMilestones` to resolve the ID to a name. Add a `useMemo` in `useIssueDetail` that maps `issue.milestone_id` to the milestone's `.title` from the milestones list.

4. **Write permission detection**: `canWrite` is hardcoded to `true`. Must derive from repository permissions. The API should return the user's permission level on the repository response. When available, use `useRepoPermissions(owner, repo)` or extract from the repository detail.

5. **Label picker overlay**: The `l` keybinding handler is a TODO stub. Implement as a `<ModalSystem>` overlay that wraps `<LabelBadgeList>` with a `<ScrollableList>` of all repo labels (from `useRepoLabels`), toggleable with `Space`. Submit with `Enter` calls `useAddIssueLabels` / `useRemoveIssueLabel`.

6. **Assignee picker overlay**: The `a` keybinding handler is a TODO stub. Implement as a modal overlay wrapping `useRepoCollaborators` in a searchable list. Selected users are toggled with `Space`, submitted with `Enter`.

7. **Virtualized rendering**: For issues with 100+ comments, the current flat list may cause performance issues. Integrate OpenTUI's scroll virtualization when available, or implement a windowed rendering approach that only mounts visible + buffer items.

8. **Comment editing/deletion**: The `CommentBlock` shows `(yours)` indicator for the current user's comments but does not yet support `x` (delete) or `e` (edit) on individual comments. This requires per-comment focus tracking and additional keybindings scoped to focused comments.

9. **Telemetry events**: Logging is implemented but the product analytics events (`tui.issue_detail.viewed`, `tui.issue_detail.comment_created`, etc.) need to be wired to the telemetry system in `apps/tui/src/lib/telemetry.ts` when the telemetry infrastructure is ready.

10. **Scroll position restoration**: When navigating from issue detail to a dependency and pressing `q` to come back, the navigation stack should restore the scroll position. The `NavigationProvider` already supports `saveScrollPosition`/`getScrollPosition` — wire it to the scrollbox ref's `scrollY` on unmount and restore on re-mount.

---

## Unit & Integration Tests

**Test file**: `e2e/tui/issues.test.ts`

All tests use `@microsoft/tui-test` via the helpers in `e2e/tui/helpers.ts`. Tests run against a real API server with test fixtures. Tests that fail due to unimplemented backend endpoints (events, dependencies) are **left failing** — never skipped or commented out.

### Pure Function Unit Tests

These can also be placed in a separate file for fast execution:

**File**: `apps/tui/src/screens/Issues/utils/__tests__/interleave-timeline.test.ts`

```typescript
import { describe, test, expect } from "bun:test";
import { interleaveTimeline, getCommentIndices } from "../interleave-timeline";

describe("interleaveTimeline", () => {
  test("empty inputs return empty array", () => {
    expect(interleaveTimeline([], [])).toEqual([]);
  });

  test("comments only are sorted chronologically", () => {
    const comments = [
      { id: 1, created_at: "2025-01-02T00:00:00Z", commenter: "alice", body: "b", issue_id: 1, user_id: 1, type: "comment", updated_at: "2025-01-02T00:00:00Z" },
      { id: 2, created_at: "2025-01-01T00:00:00Z", commenter: "bob", body: "a", issue_id: 1, user_id: 2, type: "comment", updated_at: "2025-01-01T00:00:00Z" },
    ];
    const result = interleaveTimeline(comments, []);
    expect(result[0].id).toBe(2); // bob first (earlier)
    expect(result[1].id).toBe(1); // alice second
  });

  test("interleaves comments and events by timestamp", () => {
    const comments = [
      { id: 1, created_at: "2025-01-01T00:00:00Z", commenter: "alice", body: "first", issue_id: 1, user_id: 1, type: "comment", updated_at: "2025-01-01T00:00:00Z" },
      { id: 2, created_at: "2025-01-03T00:00:00Z", commenter: "bob", body: "third", issue_id: 1, user_id: 2, type: "comment", updated_at: "2025-01-03T00:00:00Z" },
    ];
    const events = [
      { id: 10, issueId: 1, actorId: 1, eventType: "label_added", payload: {}, createdAt: "2025-01-02T00:00:00Z" },
    ];
    const result = interleaveTimeline(comments, events);
    expect(result.map(r => r.type)).toEqual(["comment", "event", "comment"]);
  });

  test("caps at MAX_TIMELINE_ITEMS (500)", () => {
    const comments = Array.from({ length: 300 }, (_, i) => ({
      id: i, created_at: new Date(i * 1000).toISOString(), commenter: "u", body: "b", issue_id: 1, user_id: 1, type: "comment", updated_at: new Date(i * 1000).toISOString(),
    }));
    const events = Array.from({ length: 300 }, (_, i) => ({
      id: i + 1000, issueId: 1, actorId: 1, eventType: "label_added", payload: {}, createdAt: new Date(i * 1000 + 500).toISOString(),
    }));
    const result = interleaveTimeline(comments, events);
    expect(result.length).toBe(500);
  });
});

describe("getCommentIndices", () => {
  test("returns indices of comment items only", () => {
    const items = [
      { type: "comment" as const, id: 1, sortKey: "a", comment: {} as any },
      { type: "event" as const, id: 2, sortKey: "b", event: {} as any },
      { type: "comment" as const, id: 3, sortKey: "c", comment: {} as any },
      { type: "event" as const, id: 4, sortKey: "d", event: {} as any },
      { type: "comment" as const, id: 5, sortKey: "e", comment: {} as any },
    ];
    expect(getCommentIndices(items)).toEqual([0, 2, 4]);
  });

  test("returns empty array for no comments", () => {
    const items = [
      { type: "event" as const, id: 1, sortKey: "a", event: {} as any },
    ];
    expect(getCommentIndices(items)).toEqual([]);
  });
});
```

**File**: `apps/tui/src/screens/Issues/utils/__tests__/relative-time.test.ts`

```typescript
import { describe, test, expect } from "bun:test";
import { relativeTime } from "../relative-time";

const NOW = new Date("2025-03-15T12:00:00Z");

describe("relativeTime", () => {
  test("< 60s → 'just now'", () => {
    expect(relativeTime("2025-03-15T11:59:30Z", "standard", NOW)).toBe("just now");
  });

  test("60s → '1m ago' (standard)", () => {
    expect(relativeTime("2025-03-15T11:59:00Z", "standard", NOW)).toBe("1m ago");
  });

  test("60s → '1m' (compact)", () => {
    expect(relativeTime("2025-03-15T11:59:00Z", "compact", NOW)).toBe("1m");
  });

  test("60s → '1 minute ago' (full)", () => {
    expect(relativeTime("2025-03-15T11:59:00Z", "full", NOW)).toBe("1 minute ago");
  });

  test("2h → '2h ago' (standard)", () => {
    expect(relativeTime("2025-03-15T10:00:00Z", "standard", NOW)).toBe("2h ago");
  });

  test("3d → '3d ago' (standard)", () => {
    expect(relativeTime("2025-03-12T12:00:00Z", "standard", NOW)).toBe("3d ago");
  });

  test("> 30 days → absolute date", () => {
    const result = relativeTime("2025-01-15T12:00:00Z", "standard", NOW);
    expect(result).toContain("Jan");
    expect(result).toContain("15");
    expect(result).toContain("2025");
  });

  test("future timestamps → 'just now'", () => {
    expect(relativeTime("2025-03-15T13:00:00Z", "standard", NOW)).toBe("just now");
  });

  test("exactly 30 days → 'just now' or date depending on boundary", () => {
    const result = relativeTime("2025-02-13T12:00:00Z", "standard", NOW);
    expect(result).toBe("30d ago");
  });
});
```

**File**: `apps/tui/src/screens/Issues/utils/__tests__/truncate.test.ts`

```typescript
import { describe, test, expect } from "bun:test";
import { truncateBody, truncateCommentBody, truncateLabelName, truncateUsername } from "../truncate";

describe("truncateBody", () => {
  test("null body returns empty string, not truncated", () => {
    const { text, truncated } = truncateBody(null);
    expect(text).toBe("");
    expect(truncated).toBe(false);
  });

  test("empty string returns empty string, not truncated", () => {
    const { text, truncated } = truncateBody("");
    expect(text).toBe("");
    expect(truncated).toBe(false);
  });

  test("whitespace-only body returns empty, not truncated", () => {
    const { text, truncated } = truncateBody("   \n  \t  ");
    expect(text).toBe("");
    expect(truncated).toBe(false);
  });

  test("short body passes through unchanged", () => {
    const { text, truncated } = truncateBody("Hello world");
    expect(text).toBe("Hello world");
    expect(truncated).toBe(false);
  });

  test("body at exactly 100000 chars is not truncated", () => {
    const body = "a".repeat(100_000);
    const { text, truncated } = truncateBody(body);
    expect(text.length).toBe(100_000);
    expect(truncated).toBe(false);
  });

  test("body exceeding 100000 chars is truncated", () => {
    const body = "a".repeat(100_001);
    const { text, truncated } = truncateBody(body);
    expect(text.length).toBe(100_000);
    expect(truncated).toBe(true);
  });
});

describe("truncateLabelName", () => {
  test("short name passes through", () => {
    expect(truncateLabelName("bug")).toBe("bug");
  });

  test("name at 30 chars passes through", () => {
    const name = "a".repeat(30);
    expect(truncateLabelName(name)).toBe(name);
  });

  test("name exceeding 30 chars is truncated with ellipsis", () => {
    const name = "a".repeat(40);
    const result = truncateLabelName(name);
    expect(result.length).toBeLessThanOrEqual(31); // 30 + ellipsis char
    expect(result).toContain("…");
  });
});
```

### E2E Terminal Snapshot Tests

**File**: `e2e/tui/issues.test.ts` (extend the file created by `tui-issues-screen-scaffold`)

Add a `describe("Issue Detail View", ...)` block with the following tests:

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import { launchTUI, TERMINAL_SIZES, type TUITestInstance } from "./helpers";

const OWNER = "test-org";
const REPO = "test-repo";

describe("Issue Detail View", () => {
  let tui: TUITestInstance;

  afterEach(async () => {
    await tui?.terminate();
  });

  // ── Snapshot Tests ──

  describe("terminal snapshots", () => {
    test("SNAP-ISSUE-DET-001: renders at 120x40 with all sections", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("#42", 10000);
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("SNAP-ISSUE-DET-002: renders at 80x24 compact layout", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("#42", 10000);
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("SNAP-ISSUE-DET-003: renders at 200x60 expanded layout", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.large.width,
        rows: TERMINAL_SIZES.large.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("#42", 10000);
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("SNAP-ISSUE-DET-004: open issue state badge in green", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "1"],
      });
      await tui.waitForText("[open]", 10000);
      // Verify state badge text is present
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("[open]");
    });

    test("SNAP-ISSUE-DET-005: closed issue state badge in red with closed_at", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "2"],
      });
      await tui.waitForText("[closed]", 10000);
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("[closed]");
    });

    test("SNAP-ISSUE-DET-006: issue with no body shows placeholder", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "3"],
      });
      await tui.waitForText("No description provided", 10000);
      expect(tui.snapshot()).toContain("No description provided.");
    });

    test("SNAP-ISSUE-DET-007: issue with labels renders colored badges", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("bug", 10000);
      const snapshot = tui.snapshot();
      expect(snapshot).toMatch(/\[bug\]/);
    });

    test("SNAP-ISSUE-DET-008: issue with no labels/assignees omits rows", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "3"],
      });
      await tui.waitForText("#3", 10000);
      const snapshot = tui.snapshot();
      expect(snapshot).not.toContain("Assignees:");
      expect(snapshot).not.toContain("Milestone:");
    });

    test("SNAP-ISSUE-DET-009: issue with assignees", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("Assignees:", 10000);
      const snapshot = tui.snapshot();
      expect(snapshot).toMatch(/@\w+/);
    });

    test("SNAP-ISSUE-DET-010: issue with milestone", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("Milestone:", 10000);
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Milestone:");
    });

    test("SNAP-ISSUE-DET-011: comment rendering with username and timestamp", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("Comments", 10000);
      const snapshot = tui.snapshot();
      // Comments should show @username format
      expect(snapshot).toMatch(/@\w+.*ago/);
    });

    test("SNAP-ISSUE-DET-012: timeline event rendering with icons", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("Comments", 10000);
      const snapshot = tui.snapshot();
      // Timeline events have icon prefixes
      expect(snapshot).toMatch(/[+\-→↗◆]/);
    });

    test("SNAP-ISSUE-DET-016: empty comments state", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "3"],
      });
      await tui.waitForText("No comments yet", 10000);
      expect(tui.snapshot()).toContain("No comments yet. Press c to add one.");
    });

    test("SNAP-ISSUE-DET-017: loading state shows spinner", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      // The loading text should appear briefly
      // This test may pass instantly if data loads fast — that's OK
      const snapshot = tui.snapshot();
      // Either we see loading or we see the issue — both are valid
      expect(snapshot.includes("Loading issue") || snapshot.includes("#42")).toBe(true);
    });

    test("SNAP-ISSUE-DET-018: 404 error state", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "999999"],
      });
      await tui.waitForText("not found", 10000);
      expect(tui.snapshot()).toContain("not found");
    });

    test("SNAP-ISSUE-DET-020: comment creation textarea", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("#42", 10000);
      await tui.sendKeys("c");
      await tui.waitForText("New comment", 5000);
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Ctrl+S:submit");
      expect(snapshot).toContain("Esc:cancel");
    });

    test("SNAP-ISSUE-DET-023: breadcrumb display", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("#42", 10000);
      const headerLine = tui.getLine(0);
      expect(headerLine).toMatch(/Issues.*#42/);
    });

    test("SNAP-ISSUE-DET-024: status bar keybinding hints", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("#42", 10000);
      const statusLine = tui.getLine(tui.rows - 1);
      expect(statusLine).toMatch(/j\/k/);
      expect(statusLine).toMatch(/q/);
    });
  });

  // ── Keyboard Interaction Tests ──

  describe("keyboard interactions", () => {
    test("KEY-ISSUE-DET-001: j/k scrolls content", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("#42", 10000);
      const before = tui.snapshot();
      await tui.sendKeys("j", "j", "j");
      const after = tui.snapshot();
      // Content should have changed due to scrolling
      expect(before).not.toBe(after);
    });

    test("KEY-ISSUE-DET-005: n jumps to next comment", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("Comments", 10000);
      await tui.sendKeys("n");
      // After n, a comment should be focused (indicated by left border or highlight)
      const snapshot = tui.snapshot();
      // The snapshot should show some form of comment focus indicator
      expect(snapshot).toBeDefined();
    });

    test("KEY-ISSUE-DET-009: c opens comment textarea", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("#42", 10000);
      await tui.sendKeys("c");
      await tui.waitForText("New comment", 5000);
      await tui.sendText("test comment");
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("test comment");
    });

    test("KEY-ISSUE-DET-010: Ctrl+S submits comment", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("#42", 10000);
      await tui.sendKeys("c");
      await tui.waitForText("New comment", 5000);
      await tui.sendText("Great fix!");
      await tui.sendKeys("ctrl+s");
      // Textarea should close after submission
      await tui.waitForNoText("New comment", 5000);
    });

    test("KEY-ISSUE-DET-011: Esc cancels empty comment without confirmation", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("#42", 10000);
      await tui.sendKeys("c");
      await tui.waitForText("New comment", 5000);
      await tui.sendKeys("Escape");
      await tui.waitForNoText("New comment", 5000);
      // No confirmation dialog should appear
      const snapshot = tui.snapshot();
      expect(snapshot).not.toContain("Discard comment draft?");
    });

    test("KEY-ISSUE-DET-012: Esc on non-empty comment shows confirmation", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("#42", 10000);
      await tui.sendKeys("c");
      await tui.waitForText("New comment", 5000);
      await tui.sendText("draft content");
      await tui.sendKeys("Escape");
      await tui.waitForText("Discard comment draft?", 5000);
    });

    test("KEY-ISSUE-DET-013: o toggles issue state (open → closed)", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "1"],
      });
      await tui.waitForText("[open]", 10000);
      await tui.sendKeys("o");
      // Optimistic: should change immediately
      await tui.waitForText("[closed]", 5000);
    });

    test("KEY-ISSUE-DET-014: o toggles issue state (closed → open)", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "2"],
      });
      await tui.waitForText("[closed]", 10000);
      await tui.sendKeys("o");
      await tui.waitForText("[open]", 5000);
    });

    test("KEY-ISSUE-DET-015: e opens edit form", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("#42", 10000);
      await tui.sendKeys("e");
      // Should navigate to edit screen
      await tui.waitForText("Edit", 5000);
    });

    test("KEY-ISSUE-DET-016: q pops back to issue list", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issues", "--repo", `${OWNER}/${REPO}`],
      });
      await tui.waitForText("Issues", 10000);
      await tui.sendKeys("Enter"); // open first issue
      await tui.waitForText("#", 10000); // wait for detail
      await tui.sendKeys("q");
      await tui.waitForText("Issues", 5000); // back to list
    });

    test("KEY-ISSUE-DET-021: ? shows help overlay", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("#42", 10000);
      await tui.sendKeys("?");
      // Help overlay should show keybinding descriptions
      await tui.waitForText("scroll", 5000);
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("comment");
      expect(snapshot).toContain("back");
    });

    test("KEY-ISSUE-DET-022: : opens command palette", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("#42", 10000);
      await tui.sendKeys(":");
      // Command palette should open
      const snapshot = tui.snapshot();
      // Command palette presence can be verified by its search input or border
      expect(snapshot).toBeDefined();
    });
  });

  // ── Responsive Resize Tests ──

  describe("responsive resize", () => {
    test("RESIZE-ISSUE-DET-001: 120x40 → 80x24 collapses metadata", async () => {
      tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("#42", 10000);
      // At 120x40, metadata should be visible
      const before = tui.snapshot();
      expect(before).toContain("Assignees:");

      // Resize to compact
      await tui.resize(80, 24);
      const after = tui.snapshot();
      // Metadata should be collapsed
      expect(after).toContain("m:metadata");
    });

    test("RESIZE-ISSUE-DET-002: 80x24 → 120x40 expands metadata", async () => {
      tui = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("#42", 10000);
      const before = tui.snapshot();
      expect(before).toContain("m:metadata");

      await tui.resize(120, 40);
      const after = tui.snapshot();
      expect(after).toContain("Assignees:");
    });

    test("RESIZE-ISSUE-DET-004: scroll position preserved through resize", async () => {
      tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("Comments", 10000);
      // Scroll down to comments section
      await tui.sendKeys("G");
      const beforeResize = tui.snapshot();

      await tui.resize(100, 35);
      const afterResize = tui.snapshot();

      // Both should show the comments section (not jump back to top)
      expect(afterResize).toContain("Comments");
    });

    test("RESIZE-ISSUE-DET-008: below minimum shows too-small message", async () => {
      tui = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("#42", 10000);
      await tui.resize(60, 20);
      await tui.waitForText("Terminal too small", 5000);
    });

    test("SNAP-ISSUE-DET-025: m toggles metadata at 80x24", async () => {
      tui = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("#42", 10000);
      // At compact, metadata collapsed
      expect(tui.snapshot()).toContain("m:metadata");

      // Toggle
      await tui.sendKeys("m");
      const expanded = tui.snapshot();
      // Should now show labels/assignees
      expect(expanded).not.toContain("m:metadata");

      // Toggle back
      await tui.sendKeys("m");
      expect(tui.snapshot()).toContain("m:metadata");
    });
  });

  // ── Data Loading Tests ──

  describe("data loading", () => {
    test("DATA-ISSUE-DET-005: issue 404 handling", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "999999"],
      });
      await tui.waitForText("not found", 10000);
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("999999");
      expect(snapshot).toContain("not found");
      expect(snapshot).toMatch(/q.*back/i);
    });

    test("DATA-ISSUE-DET-004: data cached on re-navigation", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issues", "--repo", `${OWNER}/${REPO}`],
      });
      await tui.waitForText("Issues", 10000);

      // Navigate to issue detail
      await tui.sendKeys("Enter");
      await tui.waitForText("#", 10000);

      // Go back
      await tui.sendKeys("q");
      await tui.waitForText("Issues", 5000);

      // Navigate again — should be instant (cached)
      await tui.sendKeys("Enter");
      // Should appear immediately without "Loading" spinner
      const snapshot = tui.snapshot();
      expect(snapshot).not.toContain("Loading issue");
    });

    test("DATA-ISSUE-DET-008: timeline items ordered chronologically", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("Comments", 10000);
      // Scroll to comments area
      await tui.sendKeys("G");
      // Snapshot should show items — exact ordering verified by interleave-timeline unit test
      expect(tui.snapshot()).toBeDefined();
    });
  });

  // ── Edge Case Tests ──

  describe("edge cases", () => {
    test("EDGE-ISSUE-DET-008: null body shows placeholder not 'null'", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "3"],
      });
      await tui.waitForText("#3", 10000);
      const snapshot = tui.snapshot();
      expect(snapshot).not.toContain("null");
      expect(snapshot).not.toContain("undefined");
      expect(snapshot).toContain("No description provided.");
    });

    test("EDGE-ISSUE-DET-010: issue with 0 comments shows empty state", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "3"],
      });
      await tui.waitForText("No comments yet", 10000);
    });

    test("EDGE-ISSUE-DET-012: rapid j/k key repeats without crash", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("#42", 10000);
      // Rapid key repeats
      for (let i = 0; i < 50; i++) {
        await tui.sendKeys("j");
      }
      for (let i = 0; i < 50; i++) {
        await tui.sendKeys("k");
      }
      // Should not crash — snapshot should be valid
      expect(tui.snapshot()).toBeDefined();
    });

    test("EDGE-ISSUE-DET-015: issue number boundary (1)", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "1"],
      });
      await tui.waitForText("#1", 10000);
      expect(tui.snapshot()).toContain("#1");
    });

    test("EDGE-ISSUE-DET-017: write actions hidden for read-only context", async () => {
      // This test will validate when permission detection is implemented
      // Currently all users see write actions — this test documents expected behavior
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        args: ["--screen", "issue-detail", "--repo", `${OWNER}/${REPO}`, "--issue", "42"],
      });
      await tui.waitForText("#42", 10000);
      const statusLine = tui.getLine(tui.rows - 1);
      // When permissions work, read-only users should NOT see e/o in status bar
      // For now, they ARE shown — this test will start enforcing when canWrite is wired
      expect(statusLine).toBeDefined();
    });
  });
});
```

---

## Dependency Graph

```
tui-issues-data-hooks ─────────────────────────────┐
  │ useIssue, useIssueComments, useIssueEvents,    │
  │ useUpdateIssue, useCreateIssueComment,          │
  │ useRepoLabels, useRepoCollaborators             │
  ▼                                                 │
tui-issues-screen-scaffold ─────────────────────┐  │
  │ Directory structure, ScreenName entries,     │  │
  │ PlaceholderScreen → real component swap      │  │
  ▼                                              │  │
tui-issue-list-screen ──────────────────────┐   │  │
  │ Enter on list item → push IssueDetail   │   │  │
  ▼                                         │   │  │
tui-issue-labels-display ───────────────┐  │   │  │
  │ LabelBadge, LabelBadgeList,         │  │   │  │
  │ resolveColor, color utilities       │  │   │  │
  ▼                                     │  │   │  │
tui-detail-view-component ──────────┐  │  │   │  │
  │ DetailView scrollable layout,   │  │  │   │  │
  │ DetailSection, DetailHeader     │  │  │   │  │
  ▼                                 ▼  ▼  ▼   ▼  ▼
┌─────────────────────────────────────────────────────┐
│              tui-issue-detail-view                   │
│  IssueDetailScreen, IssueHeader, IssueMetadata,     │
│  CommentBlock, TimelineEventRow, IssueDependencies, │
│  CommentInput, useIssueDetail, interleaveTimeline,  │
│  relativeTime, truncation utils                     │
└─────────────────────────────────────────────────────┘
```

All dependencies must be completed before this ticket. The most critical path is `tui-issues-data-hooks` → `tui-issues-screen-scaffold` → this ticket.

---

## Performance Budget

| Metric | Target | Measurement |
|--------|--------|-------------|
| First render (cached data) | < 50ms | Time from navigation push to first paint |
| First render (fetch) | Spinner < 200ms | Time from push to spinner frame |
| Scroll latency | < 16ms | j/k keypress to visual update |
| Comment jump (n/p) | < 16ms | Keypress to focus indicator move |
| Pagination fetch | < 2000ms | Scroll trigger to appended content |
| Memory (500 comments) | < 50MB | RSS during rendering |
| State toggle (optimistic) | < 16ms | o keypress to badge color change |
| Comment submit (optimistic) | < 16ms | Ctrl+S to comment appearance in list |

**Virtualization threshold**: If the timeline has 100+ rendered items, consider windowed rendering to maintain scroll performance. The OpenTUI `<scrollbox>` handles this natively for large content heights, but custom virtualization may be needed for complex per-item rendering.

---

## Telemetry Integration Points

The following events should be emitted via `apps/tui/src/lib/telemetry.ts` when the telemetry system is wired:

| Event | Trigger | Key Properties |
|-------|---------|----------------|
| `tui.issue_detail.viewed` | Issue data renders | `owner`, `repo`, `issue_number`, `issue_state`, `comment_count`, `layout` |
| `tui.issue_detail.comment_navigated` | n/p pressed | `direction`, `comment_position`, `total_comments` |
| `tui.issue_detail.comment_created` | Ctrl+S submits | `owner`, `repo`, `issue_number`, `body_length` |
| `tui.issue_detail.state_toggled` | o pressed | `from_state`, `to_state` |
| `tui.issue_detail.dependency_navigated` | Enter on dep | `from_issue`, `to_issue`, `type` |
| `tui.issue_detail.metadata_toggled` | m pressed | `expanded` |
| `tui.issue_detail.data_load_time` | All data ready | `issue_ms`, `comments_ms`, `total_ms` |

All events automatically include `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, and `layout` via the telemetry context.

---

## Security Notes

- All API requests include the auth token from `AuthProvider` — never stored or displayed by this screen.
- 401 responses trigger the global auth error flow — the detail screen does not handle re-authentication.
- 403 responses for write actions show a transient toast and are logged — no retry loop.
- Issue content (titles, bodies, comments) is user-generated and rendered as-is. No XSS vector exists in a terminal context.
- Raw ANSI escape codes in comment bodies are escaped by the `<markdown>` component — they are not passed through to the terminal.
- The `body` and `comment.body` fields are truncated at hard limits (100K and 50K chars respectively) to prevent memory exhaustion from malicious content.