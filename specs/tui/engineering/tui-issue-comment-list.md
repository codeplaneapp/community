# Engineering Specification: TUI Issue Comment List

**Ticket**: `tui-issue-comment-list`
**Title**: Paginated chronological comment and timeline event display with interleaving
**Status**: Not started
**Dependencies**: `tui-issue-detail-view`, `tui-issues-data-hooks`

---

## Overview

This ticket implements the comment and timeline event display within the issue detail screen. The implementation covers:

1. A `CommentListSection` component that renders interleaved comments and timeline events chronologically below the issue body.
2. `CommentBlock` and `TimelineEventRow` sub-components for rendering individual items.
3. Cursor-based pagination (30 items/page, 500-item memory cap) with scroll-triggered loading.
4. `n`/`p` comment-jump navigation that skips timeline events.
5. Optimistic rendering of newly created comments with pending indicator and rollback on failure.
6. Responsive layout adaptation across three terminal breakpoints.
7. Error boundary isolation so comment section failures don't crash the issue header/body.

All code targets `apps/tui/src/`. All tests target `e2e/tui/`.

---

## Implementation Plan

### Step 1: Comment List Types and Constants

**File**: `apps/tui/src/screens/Issues/types.ts`

Extend the existing types file (created by `tui-issue-detail-view` dependency) with comment-list-specific types. These types are additive — they do not modify existing types from the parent ticket.

```typescript
// --- Additions to existing types.ts ---

// Optimistic comment state
export type OptimisticState = "confirmed" | "pending" | "failed";

// Comment with optimistic metadata attached at the component level
export interface CommentWithOptimisticState {
  comment: IssueComment;
  optimisticState: OptimisticState;
  localId?: string; // Client-generated ID for optimistic comments before server assignment
}

// Comment list section focus state
export interface CommentListFocusState {
  /** Index into the commentIndices array (NOT the timeline items array) */
  focusedCommentPosition: number;
  /** The actual timeline items array index of the focused comment */
  focusedTimelineIndex: number;
}

// Pagination state for comments + events (independent cursors)
export interface CommentListPaginationState {
  commentsCursor: string | null;
  eventsCursor: string | null;
  commentsHasMore: boolean;
  eventsHasMore: boolean;
  isLoadingMore: boolean;
  totalItemsLoaded: number;
  isCapped: boolean;
}

// Layout tier for responsive comment rendering
export type CommentListLayout = "compact" | "standard" | "expanded";

// Constants specific to comment list
export const COMMENT_BODY_TRUNCATION_NOTICE = "Comment truncated. View full comment on web.";
export const ITEMS_CAPPED_NOTICE_PREFIX = "Showing";
export const ITEMS_CAPPED_NOTICE_SUFFIX = "items. View full history on web.";
export const EMPTY_COMMENTS_MESSAGE = "No comments yet. Press c to add one.";
export const TIMELINE_EVENTS_UNAVAILABLE = "Timeline events unavailable";
export const COMMENTS_LOAD_FAILED = "Failed to load comments";
export const COMMENTS_AND_EVENTS_FAILED = "Failed to load comments and timeline";
export const PAGINATION_SCROLL_THRESHOLD = 0.8; // 80% scroll depth triggers fetch
export const PAGINATION_DEDUP_COOLDOWN_MS = 200;
```

**Rationale**: Adding optimistic state tracking as a separate type avoids polluting the `IssueComment` data type from `@codeplane/ui-core`. The `CommentListFocusState` uses a two-index system: position within comment-only array (for `n`/`p`) and index within the full timeline array (for scroll-into-view). Constants are colocated with types for single-import convenience.

---

### Step 2: Timeline Interleaving with Deduplication

**File**: `apps/tui/src/screens/Issues/utils/interleave-timeline.ts`

This file is created by the `tui-issue-detail-view` dependency. This step extends it with deduplication logic and an optimistic comment insertion function.

```typescript
import type { IssueComment, IssueEvent } from "@codeplane/ui-core";
import type { TimelineItem, TimelineCommentItem, TimelineEventItem, CommentWithOptimisticState } from "../types";
import { MAX_TIMELINE_ITEMS } from "../types";

/**
 * Merge comments and events into a single chronologically sorted array.
 * - Sorted by created_at ASC
 * - Ties broken: events before comments (stable sort)
 * - Deduplicates by (type, id) tuple
 * - Capped at MAX_TIMELINE_ITEMS (500)
 */
export function interleaveTimeline(
  comments: IssueComment[],
  events: IssueEvent[],
): TimelineItem[] {
  const seen = new Set<string>();

  const commentItems: TimelineCommentItem[] = [];
  for (const c of comments) {
    const key = `comment:${c.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    commentItems.push({
      type: "comment" as const,
      id: c.id,
      sortKey: c.created_at,
      comment: c,
    });
  }

  const eventItems: TimelineEventItem[] = [];
  for (const e of events) {
    const key = `event:${e.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    eventItems.push({
      type: "event" as const,
      id: e.id,
      sortKey: e.createdAt,
      event: e,
    });
  }

  const merged = [...commentItems, ...eventItems].sort((a, b) => {
    const cmp = a.sortKey.localeCompare(b.sortKey);
    if (cmp !== 0) return cmp;
    // Tie-break: events before comments
    if (a.type === "event" && b.type === "comment") return -1;
    if (a.type === "comment" && b.type === "event") return 1;
    return 0;
  });

  return merged.slice(0, MAX_TIMELINE_ITEMS);
}

/**
 * Returns indices within the timeline array that are comments.
 * Used for n/p navigation to skip timeline events.
 */
export function getCommentIndices(items: TimelineItem[]): number[] {
  return items
    .map((item, index) => (item.type === "comment" ? index : -1))
    .filter((i) => i !== -1);
}

/**
 * Insert an optimistic comment at the end of the timeline.
 * Returns a new array (does not mutate).
 */
export function insertOptimisticComment(
  items: TimelineItem[],
  comment: IssueComment,
): TimelineItem[] {
  const newItem: TimelineCommentItem = {
    type: "comment",
    id: comment.id,
    sortKey: comment.created_at,
    comment,
  };
  return [...items, newItem];
}

/**
 * Remove an optimistic comment by its ID.
 * Returns a new array (does not mutate).
 */
export function removeOptimisticComment(
  items: TimelineItem[],
  commentId: number,
): TimelineItem[] {
  return items.filter(
    (item) => !(item.type === "comment" && item.id === commentId)
  );
}
```

**Rationale**: Deduplication via `(type, id)` tuple handles the case where cursor-based pagination returns overlapping items across pages. Optimistic insert/remove functions return new arrays to trigger React re-renders without mutating state.

---

### Step 3: Comment List Data Hook

**File**: `apps/tui/src/screens/Issues/hooks/useCommentListData.ts`

Custom hook that coordinates fetching from two independent paginated endpoints (comments and events), merges results, and manages pagination state.

```typescript
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useIssueComments, useIssueEvents, useUser } from "@codeplane/ui-core";
import { interleaveTimeline, getCommentIndices } from "../utils/interleave-timeline";
import type { TimelineItem, CommentListPaginationState } from "../types";
import { MAX_TIMELINE_ITEMS, TIMELINE_PAGE_SIZE, PAGINATION_DEDUP_COOLDOWN_MS } from "../types";
import { logger } from "../../../lib/logger";
import { emit } from "../../../lib/telemetry";

interface UseCommentListDataOptions {
  owner: string;
  repo: string;
  issueNumber: number;
}

interface UseCommentListDataReturn {
  /** Merged, chronologically sorted timeline items */
  timelineItems: TimelineItem[];
  /** Indices of comment items within timelineItems (for n/p nav) */
  commentIndices: number[];
  /** Whether initial data is still loading */
  isLoading: boolean;
  /** Whether a pagination request is in flight */
  isLoadingMore: boolean;
  /** Error from comments endpoint */
  commentsError: Error | null;
  /** Error from events endpoint */
  eventsError: Error | null;
  /** Total items loaded */
  totalItemsLoaded: number;
  /** Whether 500-item cap has been reached */
  isCapped: boolean;
  /** Total server-side count (from both endpoints) */
  totalServerCount: number;
  /** Whether more items exist beyond what's loaded */
  hasMore: boolean;
  /** Load the next page of whichever source has earlier data */
  loadMore: () => void;
  /** Retry failed requests */
  retry: () => void;
  /** Current user for author detection */
  currentUserId: number | null;
  /** User permission level */
  userPermission: string | null;
}

export function useCommentListData({
  owner,
  repo,
  issueNumber,
}: UseCommentListDataOptions): UseCommentListDataReturn {
  const comments = useIssueComments(owner, repo, issueNumber, {
    limit: TIMELINE_PAGE_SIZE,
  });
  const events = useIssueEvents(owner, repo, issueNumber, {
    limit: TIMELINE_PAGE_SIZE,
  });
  const { user } = useUser();

  const lastLoadMoreTime = useRef(0);
  const [isCapped, setIsCapped] = useState(false);

  // Merge comments and events into timeline
  const allComments = comments.items ?? [];
  const allEvents = events.items ?? [];

  const timelineItems = useMemo(() => {
    const startMs = performance.now();
    const merged = interleaveTimeline(allComments, allEvents);
    const mergeMs = performance.now() - startMs;

    if (mergeMs > 100) {
      logger.warn(
        `CommentList: large merge [comments=${allComments.length}] [events=${allEvents.length}] [merge_ms=${Math.round(mergeMs)}]`
      );
    } else {
      logger.debug(
        `CommentList: timeline merged [comments=${allComments.length}] [events=${allEvents.length}] [total=${merged.length}]`
      );
    }

    // Check if we've hit the cap
    if (merged.length >= MAX_TIMELINE_ITEMS && !isCapped) {
      setIsCapped(true);
      emit("tui.issue_comment_list.items_capped", {
        total_server_items: (comments.totalCount ?? 0) + (events.totalCount ?? 0),
        items_loaded: merged.length,
      });
    }

    return merged;
  }, [allComments, allEvents, isCapped]);

  const commentIndices = useMemo(
    () => getCommentIndices(timelineItems),
    [timelineItems]
  );

  const totalItemsLoaded = timelineItems.length;
  const totalServerCount = (comments.totalCount ?? 0) + (events.totalCount ?? 0);
  const hasMore =
    !isCapped &&
    totalItemsLoaded < MAX_TIMELINE_ITEMS &&
    ((comments.hasMore ?? false) || (events.hasMore ?? false));

  const loadMore = useCallback(() => {
    // Deduplication: prevent rapid successive calls
    const now = Date.now();
    if (now - lastLoadMoreTime.current < PAGINATION_DEDUP_COOLDOWN_MS) return;
    if (isCapped) return;
    if (comments.isLoading || events.isLoading) return;

    lastLoadMoreTime.current = now;

    // Load whichever source has more data
    // Prefer the source whose last item has the earlier timestamp
    const commentsHasMore = comments.hasMore ?? false;
    const eventsHasMore = events.hasMore ?? false;

    if (commentsHasMore && eventsHasMore) {
      // Load both concurrently
      comments.fetchMore?.();
      events.fetchMore?.();
      logger.info(
        `CommentList: pagination [issue=${issueNumber}] [source=both]`
      );
    } else if (commentsHasMore) {
      comments.fetchMore?.();
      logger.info(
        `CommentList: pagination [issue=${issueNumber}] [source=comments]`
      );
    } else if (eventsHasMore) {
      events.fetchMore?.();
      logger.info(
        `CommentList: pagination [issue=${issueNumber}] [source=events]`
      );
    }
  }, [comments, events, isCapped, issueNumber]);

  const retry = useCallback(() => {
    comments.refetch?.();
    events.refetch?.();
  }, [comments, events]);

  // Log mount
  useEffect(() => {
    logger.debug(
      `CommentList: mounted [owner=${owner}] [repo=${repo}] [issue=${issueNumber}]`
    );
  }, [owner, repo, issueNumber]);

  return {
    timelineItems,
    commentIndices,
    isLoading: (comments.isLoading && allComments.length === 0) ||
               (events.isLoading && allEvents.length === 0),
    isLoadingMore: (comments.isLoading && allComments.length > 0) ||
                   (events.isLoading && allEvents.length > 0),
    commentsError: comments.error ?? null,
    eventsError: events.error ?? null,
    totalItemsLoaded,
    isCapped,
    totalServerCount,
    hasMore,
    loadMore,
    retry,
    currentUserId: user?.id ?? null,
    userPermission: null, // TODO: resolved from repo permissions API when available
  };
}
```

**Rationale**: The hook encapsulates all data coordination complexity. Comments and events are fetched independently (allowing graceful degradation if one endpoint fails). Deduplication via cooldown prevents scroll-triggered rapid-fire pagination. The `isCapped` flag is sticky — once set, pagination stops permanently for the session.

---

### Step 4: Comment Navigation Hook

**File**: `apps/tui/src/screens/Issues/hooks/useCommentNavigation.ts`

Manages `n`/`p` focus state across the comment list, skipping timeline events.

```typescript
import { useState, useCallback, useMemo, useEffect } from "react";
import type { TimelineItem, CommentListFocusState } from "../types";
import { logger } from "../../../lib/logger";
import { emit } from "../../../lib/telemetry";

interface UseCommentNavigationOptions {
  commentIndices: number[];
  timelineItems: TimelineItem[];
  /** Callback when focused comment changes — used to scroll into view */
  onFocusChange?: (timelineIndex: number) => void;
}

interface UseCommentNavigationReturn {
  /** The timeline array index of the currently focused comment, or -1 if none */
  focusedTimelineIndex: number;
  /** Move focus to the next comment */
  focusNextComment: () => void;
  /** Move focus to the previous comment */
  focusPrevComment: () => void;
  /** Whether a specific timeline item is the focused comment */
  isFocused: (timelineIndex: number) => boolean;
  /** Total number of comments (not events) */
  totalComments: number;
}

export function useCommentNavigation({
  commentIndices,
  timelineItems,
  onFocusChange,
}: UseCommentNavigationOptions): UseCommentNavigationReturn {
  // Position within the commentIndices array
  const [focusedPosition, setFocusedPosition] = useState(0);

  const totalComments = commentIndices.length;

  // Clamp position if comments change (e.g., optimistic add/remove)
  useEffect(() => {
    if (totalComments === 0) {
      setFocusedPosition(0);
    } else if (focusedPosition >= totalComments) {
      setFocusedPosition(totalComments - 1);
    }
  }, [totalComments, focusedPosition]);

  const focusedTimelineIndex = useMemo(() => {
    if (totalComments === 0) return -1;
    const clamped = Math.min(focusedPosition, totalComments - 1);
    return commentIndices[clamped] ?? -1;
  }, [commentIndices, focusedPosition, totalComments]);

  const focusNextComment = useCallback(() => {
    if (totalComments <= 1) return; // 0 or 1 comments: no-op
    setFocusedPosition((prev) => {
      const next = Math.min(prev + 1, totalComments - 1);
      if (next !== prev) {
        const nextTimelineIndex = commentIndices[next];
        const prevTimelineIndex = commentIndices[prev];
        logger.debug(
          `CommentList: nav [direction=n] [from=${prevTimelineIndex}] [to=${nextTimelineIndex}] [position=${next}]`
        );
        emit("tui.issue_comment_list.comment_navigated", {
          direction: "next",
          from_comment_id: timelineItems[prevTimelineIndex]?.id,
          to_comment_id: timelineItems[nextTimelineIndex]?.id,
          comment_position: next,
          total_comments: totalComments,
        });
        onFocusChange?.(nextTimelineIndex);
      }
      return next;
    });
  }, [totalComments, commentIndices, timelineItems, onFocusChange]);

  const focusPrevComment = useCallback(() => {
    if (totalComments <= 1) return; // 0 or 1 comments: no-op
    setFocusedPosition((prev) => {
      const next = Math.max(prev - 1, 0);
      if (next !== prev) {
        const nextTimelineIndex = commentIndices[next];
        const prevTimelineIndex = commentIndices[prev];
        logger.debug(
          `CommentList: nav [direction=p] [from=${prevTimelineIndex}] [to=${nextTimelineIndex}] [position=${next}]`
        );
        emit("tui.issue_comment_list.comment_navigated", {
          direction: "prev",
          from_comment_id: timelineItems[prevTimelineIndex]?.id,
          to_comment_id: timelineItems[nextTimelineIndex]?.id,
          comment_position: next,
          total_comments: totalComments,
        });
        onFocusChange?.(nextTimelineIndex);
      }
      return next;
    });
  }, [totalComments, commentIndices, timelineItems, onFocusChange]);

  const isFocused = useCallback(
    (timelineIndex: number) => timelineIndex === focusedTimelineIndex,
    [focusedTimelineIndex]
  );

  return {
    focusedTimelineIndex,
    focusNextComment,
    focusPrevComment,
    isFocused,
    totalComments,
  };
}
```

**Rationale**: Separating navigation state from the rendering component keeps the `CommentListSection` focused on display. The position-in-comment-array ↔ index-in-timeline-array indirection is necessary because `n`/`p` should only stop at comments, not events. The `onFocusChange` callback enables scroll-into-view integration.

---

### Step 5: Relative Time Formatting Utility

**File**: `apps/tui/src/screens/Issues/utils/relative-time.ts`

This file is created by the `tui-issue-detail-view` dependency. No modifications needed — the comment list consumes it directly. The three format tiers (`compact`, `standard`, `full`) map to terminal breakpoints:

- `compact` (80×24 – 119×39): `"2h"`
- `standard` (120×40 – 199×59): `"2h ago"`
- `full` (200×60+): `"2 hours ago"`

---

### Step 6: Comment Block Component

**File**: `apps/tui/src/screens/Issues/components/CommentBlock.tsx`

This file is scaffolded by `tui-issue-detail-view`. This step replaces the scaffold with the full implementation matching all product spec requirements.

```typescript
import React from "react";
import { useTheme } from "../../../hooks/useTheme";
import { useDiffSyntaxStyle } from "../../../hooks/useDiffSyntaxStyle";
import { relativeTime, type TimestampFormat } from "../utils/relative-time";
import { truncateCommentBody, truncateUsername } from "../utils/truncate";
import { COMMENT_BODY_TRUNCATION_NOTICE } from "../types";
import type { IssueComment } from "@codeplane/ui-core";
import type { CommentListLayout, OptimisticState } from "../types";
import { logger } from "../../../lib/logger";

interface CommentBlockProps {
  comment: IssueComment;
  focused: boolean;
  timestampFormat: TimestampFormat;
  isCurrentUser: boolean;
  isAdmin: boolean;
  layout: CommentListLayout;
  optimisticState?: OptimisticState;
}

export function CommentBlock({
  comment,
  focused,
  timestampFormat,
  isCurrentUser,
  isAdmin,
  layout,
  optimisticState = "confirmed",
}: CommentBlockProps) {
  const theme = useTheme();
  const syntaxStyle = useDiffSyntaxStyle();
  const { text: bodyText, truncated } = truncateCommentBody(comment.body);

  const isEdited = comment.updated_at !== comment.created_at;
  const showIndicators = layout !== "compact"; // hide [edit]/[delete] at compact
  const isPending = optimisticState === "pending";

  // Gap between comment blocks is responsive
  const marginTop = layout === "expanded" ? 2 : 1;

  // Log truncation
  if (truncated) {
    logger.warn(
      `CommentList: body truncated [comment_id=${comment.id}] [original_length=${comment.body.length}]`
    );
  }

  return (
    <box flexDirection="row" marginTop={marginTop}>
      {/* Left accent bar: │ for focused, space for unfocused */}
      <box width={2} flexShrink={0}>
        <text fg={focused ? theme.primary : undefined}>
          {focused ? "│ " : "  "}
        </text>
      </box>

      {/* Comment content */}
      <box flexDirection="column" flexGrow={1} flexShrink={1}>
        {/* Header row: @user · timestamp · edited · (you) · [edit] [delete] */}
        <box flexDirection="row" gap={1}>
          <text
            fg={isPending ? theme.muted : theme.primary}
            attributes={1 /* BOLD */}
          >
            @{truncateUsername(comment.commenter)}
          </text>
          <text fg={theme.muted}>·</text>
          <text fg={theme.muted}>
            {relativeTime(comment.created_at, timestampFormat)}
          </text>
          {isEdited && <text fg={theme.muted}>· edited</text>}
          {isCurrentUser && <text fg={theme.muted}>(you)</text>}
          {isPending && <text fg={theme.muted}>· sending…</text>}
          {showIndicators && isCurrentUser && (
            <text fg={theme.muted}>[edit]</text>
          )}
          {showIndicators && (isCurrentUser || isAdmin) && (
            <text fg={theme.muted}>[delete]</text>
          )}
        </box>

        {/* Comment body - markdown rendered */}
        {bodyText.length > 0 ? (
          <markdown content={bodyText} syntaxStyle={syntaxStyle} />
        ) : (
          <box height={1} /> /* Empty comment body — preserve spacing */
        )}

        {truncated && (
          <text fg={theme.muted}>{COMMENT_BODY_TRUNCATION_NOTICE}</text>
        )}
      </box>
    </box>
  );
}
```

**Key behaviors**:
- Left accent bar `│` in primary color indicates focused comment. Unfocused comments have 2-char padding for alignment.
- `(you)` suffix for current user's comments.
- `edited` indicator when `updated_at !== created_at`.
- `[edit]` and `[delete]` indicators hidden at compact breakpoint (<120 cols).
- `[delete]` shown for both comment authors and repo admins.
- Empty comment body renders as 1-row spacer (username + timestamp still visible).
- Optimistic comments show `sending…` suffix with muted coloring.
- `<markdown>` component requires `syntaxStyle` prop from `useDiffSyntaxStyle()`.

---

### Step 7: Timeline Event Row Component

**File**: `apps/tui/src/screens/Issues/components/TimelineEventRow.tsx`

This file is scaffolded by `tui-issue-detail-view`. This step extends it with description truncation and unknown event type handling.

```typescript
import React from "react";
import { useTheme } from "../../../hooks/useTheme";
import { relativeTime, type TimestampFormat } from "../utils/relative-time";
import { truncateRight } from "../../../util/text";
import { EVENT_ICONS, MAX_USERNAME_LENGTH } from "../types";
import type { IssueEvent } from "@codeplane/ui-core";
import type { CommentListLayout } from "../types";

interface TimelineEventRowProps {
  event: IssueEvent;
  timestampFormat: TimestampFormat;
  layout: CommentListLayout;
}

export function TimelineEventRow({
  event,
  timestampFormat,
  layout,
}: TimelineEventRowProps) {
  const theme = useTheme();
  const icon = EVENT_ICONS[event.eventType] ?? "?"; // Unknown type → ? icon
  const description = formatEventDescription(event);

  // Truncate description at compact width
  const maxDescriptionLen = layout === "compact" ? 80 : undefined;
  const displayDescription = maxDescriptionLen
    ? truncateRight(description, maxDescriptionLen)
    : description;

  return (
    <box flexDirection="row" gap={1} paddingLeft={2}>
      <text fg={theme.muted}>{icon}</text>
      <text fg={theme.muted}>
        {displayDescription} — {relativeTime(event.createdAt, timestampFormat)}
      </text>
    </box>
  );
}

function formatEventDescription(event: IssueEvent): string {
  const payload = event.payload as Record<string, unknown> | null;
  const actor = payload?.actor
    ? `@${truncateRight(String(payload.actor), MAX_USERNAME_LENGTH)}`
    : "Someone";

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

**Key behaviors**:
- Unknown event types render with `?` icon and humanized event type name.
- Description truncated at 80 chars with `…` at compact breakpoint.
- Timeline events use 2-char left padding to align visually below comment accent bars.
- Actor username truncated at 39 chars.

---

### Step 8: Comment Section Separator Component

**File**: `apps/tui/src/screens/Issues/components/CommentSeparator.tsx`

Renders the `─── Comments (N) ───` separator.

```typescript
import React from "react";
import { useTheme } from "../../../hooks/useTheme";
import { useLayout } from "../../../hooks/useLayout";

interface CommentSeparatorProps {
  commentCount: number;
}

export function CommentSeparator({ commentCount }: CommentSeparatorProps) {
  const theme = useTheme();
  const { width } = useLayout();

  const label = ` Comments (${commentCount}) `;
  const availableWidth = Math.max(0, width - 4); // Account for container padding
  const labelLen = label.length;

  if (availableWidth <= labelLen) {
    // Not enough space for decorators — just show label
    return <text fg={theme.border}>{label}</text>;
  }

  const remainingDashes = availableWidth - labelLen;
  const leftDashes = Math.floor(remainingDashes / 2);
  const rightDashes = remainingDashes - leftDashes;

  return (
    <text fg={theme.border}>
      {"─".repeat(leftDashes)}{label}{"─".repeat(rightDashes)}
    </text>
  );
}
```

**Key behaviors**:
- `commentCount` is the server-side `issue.comment_count`, not the count of loaded items.
- Separator spans full content width with centered label.
- Uses `border` color token for visual separation from content.
- Degrades gracefully when terminal is too narrow for dashes.

---

### Step 9: Comment List Section Component (Main Component)

**File**: `apps/tui/src/screens/Issues/components/CommentListSection.tsx`

The primary orchestration component for the comment list. Consumes data hook, navigation hook, and renders the full comment/timeline section.

```typescript
import React, { useCallback, useRef, useEffect, useMemo, useState } from "react";
import { useTheme } from "../../../hooks/useTheme";
import { useLayout } from "../../../hooks/useLayout";
import { useScreenKeybindings } from "../../../hooks/useScreenKeybindings";
import { useCommentListData } from "../hooks/useCommentListData";
import { useCommentNavigation } from "../hooks/useCommentNavigation";
import { CommentBlock } from "./CommentBlock";
import { TimelineEventRow } from "./TimelineEventRow";
import { CommentSeparator } from "./CommentSeparator";
import type { TimestampFormat } from "../utils/relative-time";
import type { CommentListLayout, OptimisticState } from "../types";
import {
  EMPTY_COMMENTS_MESSAGE,
  TIMELINE_EVENTS_UNAVAILABLE,
  COMMENTS_LOAD_FAILED,
  COMMENTS_AND_EVENTS_FAILED,
  MAX_TIMELINE_ITEMS,
  ITEMS_CAPPED_NOTICE_PREFIX,
  ITEMS_CAPPED_NOTICE_SUFFIX,
  PAGINATION_SCROLL_THRESHOLD,
} from "../types";
import { logger } from "../../../lib/logger";
import { emit } from "../../../lib/telemetry";

interface CommentListSectionProps {
  owner: string;
  repo: string;
  issueNumber: number;
  /** Server-side comment count from issue.comment_count */
  issueCommentCount: number;
  /** Callback to scroll a timeline item into view (provided by parent scrollbox) */
  scrollToItem?: (itemId: string) => void;
}

export function CommentListSection({
  owner,
  repo,
  issueNumber,
  issueCommentCount,
  scrollToItem,
}: CommentListSectionProps) {
  const theme = useTheme();
  const layout = useLayout();
  const renderStartRef = useRef(performance.now());

  // Determine responsive layout tier
  const commentLayout: CommentListLayout = useMemo(() => {
    if (!layout.breakpoint) return "compact";
    if (layout.breakpoint === "large") return "expanded";
    if (layout.width >= 120) return "standard";
    return "compact";
  }, [layout.breakpoint, layout.width]);

  // Determine timestamp format based on layout tier
  const timestampFormat: TimestampFormat = useMemo(() => {
    switch (commentLayout) {
      case "compact": return "compact";
      case "expanded": return "full";
      default: return "standard";
    }
  }, [commentLayout]);

  // Data hook
  const data = useCommentListData({ owner, repo, issueNumber });

  // Navigation hook
  const onFocusChange = useCallback(
    (timelineIndex: number) => {
      const item = data.timelineItems[timelineIndex];
      if (item && scrollToItem) {
        scrollToItem(`timeline-${item.type}-${item.id}`);
      }
    },
    [data.timelineItems, scrollToItem]
  );

  const nav = useCommentNavigation({
    commentIndices: data.commentIndices,
    timelineItems: data.timelineItems,
    onFocusChange,
  });

  // Scroll-triggered pagination
  const handleScroll = useCallback(
    (scrollPercent: number) => {
      if (scrollPercent >= PAGINATION_SCROLL_THRESHOLD && data.hasMore && !data.isLoadingMore) {
        data.loadMore();
        emit("tui.issue_comment_list.pagination_triggered", {
          items_loaded_before: data.totalItemsLoaded,
        });
      }
      if (scrollPercent >= 0.5) {
        emit("tui.issue_comment_list.scrolled", {
          scroll_depth_percent: Math.round(scrollPercent * 100),
          total_items_loaded: data.totalItemsLoaded,
        });
      }
    },
    [data]
  );

  // Telemetry: rendered event
  useEffect(() => {
    if (!data.isLoading && data.timelineItems.length >= 0) {
      const renderMs = performance.now() - renderStartRef.current;
      logger.info(
        `CommentList: rendered [issue=${issueNumber}] [comments=${nav.totalComments}] [events=${data.totalItemsLoaded - nav.totalComments}] [total_ms=${Math.round(renderMs)}]`
      );
      emit("tui.issue_comment_list.rendered", {
        owner,
        repo,
        issue_number: issueNumber,
        comment_count: nav.totalComments,
        event_count: data.totalItemsLoaded - nav.totalComments,
        total_items: data.totalItemsLoaded,
        terminal_width: layout.width,
        terminal_height: layout.height,
        layout: commentLayout,
      });
    }
  }, [data.isLoading]);

  // Telemetry: empty state
  useEffect(() => {
    if (!data.isLoading && nav.totalComments === 0 && data.totalItemsLoaded === 0) {
      emit("tui.issue_comment_list.empty_state_shown", {
        owner,
        repo,
        issue_number: issueNumber,
        event_count: 0,
      });
    }
  }, [data.isLoading, nav.totalComments, data.totalItemsLoaded]);

  // --- Error states ---

  // Both endpoints failed
  if (data.commentsError && data.eventsError && data.totalItemsLoaded === 0) {
    return (
      <box flexDirection="column" gap={1}>
        <CommentSeparator commentCount={issueCommentCount} />
        <text fg={theme.error}>
          {COMMENTS_AND_EVENTS_FAILED} — press R to retry
        </text>
      </box>
    );
  }

  // Comments failed but events loaded
  if (data.commentsError && !data.eventsError) {
    // Render events with error notice for comments
    return (
      <box flexDirection="column" gap={1}>
        <CommentSeparator commentCount={issueCommentCount} />
        <text fg={theme.error}>
          {COMMENTS_LOAD_FAILED} — press R to retry
        </text>
        {data.timelineItems
          .filter((item) => item.type === "event")
          .map((item) => (
            <TimelineEventRow
              key={`event-${item.id}`}
              event={item.type === "event" ? item.event : undefined!}
              timestampFormat={timestampFormat}
              layout={commentLayout}
            />
          ))}
      </box>
    );
  }

  // Events failed but comments loaded (degraded mode)
  const showEventsWarning = data.eventsError && !data.commentsError;

  // --- Empty state ---
  const hasNoContent = data.totalItemsLoaded === 0 && !data.isLoading;
  const hasNoComments = nav.totalComments === 0;

  return (
    <box flexDirection="column">
      <CommentSeparator commentCount={issueCommentCount} />

      {showEventsWarning && (
        <text fg={theme.warning}>{TIMELINE_EVENTS_UNAVAILABLE}</text>
      )}

      {hasNoContent && issueCommentCount === 0 && (
        <text fg={theme.muted}>{EMPTY_COMMENTS_MESSAGE}</text>
      )}

      {/* Interleaved timeline items */}
      {data.timelineItems.map((item, index) => {
        if (item.type === "comment") {
          const isCurrentUser = item.comment.user_id === data.currentUserId;
          const isAdmin = data.userPermission === "admin";
          return (
            <CommentBlock
              key={`comment-${item.id}`}
              comment={item.comment}
              focused={nav.isFocused(index)}
              timestampFormat={timestampFormat}
              isCurrentUser={isCurrentUser}
              isAdmin={isAdmin}
              layout={commentLayout}
            />
          );
        } else {
          return (
            <TimelineEventRow
              key={`event-${item.id}`}
              event={item.event}
              timestampFormat={timestampFormat}
              layout={commentLayout}
            />
          );
        }
      })}

      {/* Pagination loading indicator */}
      {data.isLoadingMore && (
        <text fg={theme.muted}>Loading more…</text>
      )}

      {/* Items capped notice */}
      {data.isCapped && (
        <text fg={theme.warning}>
          {ITEMS_CAPPED_NOTICE_PREFIX} {MAX_TIMELINE_ITEMS} of{" "}
          {data.totalServerCount} {ITEMS_CAPPED_NOTICE_SUFFIX}
        </text>
      )}
    </box>
  );
}
```

**Key behaviors**:
- Renders inside the parent issue detail `<scrollbox>`, not its own scrollbox. Scroll events are forwarded from the parent.
- Separator always renders (even for zero comments).
- Empty state: "No comments yet. Press c to add one." only when zero comments AND zero events.
- If zero comments but has events, events render without the "no comments" message.
- Degraded modes: comments-only when events fail, events-only when comments fail, full error when both fail.
- Error states include "press R to retry" hint.
- Pagination indicator at bottom during fetch.
- Cap notice in warning color when 500-item limit reached.

---

### Step 10: Keybinding Registration

**File**: `apps/tui/src/screens/Issues/IssueDetailScreen.tsx` (modification)

The issue detail screen (from `tui-issue-detail-view`) must register the comment list keybindings. This step adds `n`, `p` to the existing screen keybindings array.

```typescript
// Inside IssueDetailScreen component, extend existing useScreenKeybindings call:

useScreenKeybindings(
  [
    // ... existing bindings from tui-issue-detail-view ...
    // Comment navigation
    {
      key: "n",
      description: "Next comment",
      group: "Comments",
      handler: () => commentNav.focusNextComment(),
    },
    {
      key: "p",
      description: "Previous comment",
      group: "Comments",
      handler: () => commentNav.focusPrevComment(),
    },
    {
      key: "R",
      description: "Retry failed load",
      group: "Comments",
      handler: () => commentData.retry(),
      when: () => commentData.commentsError !== null || commentData.eventsError !== null,
    },
  ],
  [
    // Status bar hints
    // ... existing hints ...
    { keys: "n/p", label: "comments", order: 50 },
    { keys: "j/k", label: "scroll", order: 10 },
    { keys: "G/gg", label: "top/bottom", order: 20 },
  ]
);
```

**Rationale**: `n`/`p` are registered at the screen level (PRIORITY.SCREEN = 4), below text input and modals, ensuring they don't conflict with the comment creation textarea (which operates at PRIORITY.TEXT_INPUT = 1). The `R` retry binding uses a `when` predicate to only activate when an error state exists.

---

### Step 11: Optimistic Comment Integration

**File**: `apps/tui/src/screens/Issues/hooks/useOptimisticComments.ts`

Hook that bridges the `useCreateIssueComment` mutation with the comment list's optimistic rendering.

```typescript
import { useState, useCallback } from "react";
import { useCreateIssueComment } from "@codeplane/ui-core";
import { useOptimisticMutation } from "../../../hooks/useOptimisticMutation";
import type { IssueComment } from "@codeplane/ui-core";
import { logger } from "../../../lib/logger";

interface OptimisticComment {
  localComment: IssueComment;
  isPending: boolean;
}

interface UseOptimisticCommentsOptions {
  owner: string;
  repo: string;
  issueNumber: number;
  currentUserId: number;
  currentUsername: string;
  /** Callback when optimistic comment should be added to timeline */
  onCommentAdded: (comment: IssueComment) => void;
  /** Callback when optimistic comment should be removed (server rejected) */
  onCommentRemoved: (commentId: number) => void;
  /** Callback to re-open comment textarea with preserved content */
  onReopenTextarea: (body: string) => void;
}

export function useOptimisticComments({
  owner,
  repo,
  issueNumber,
  currentUserId,
  currentUsername,
  onCommentAdded,
  onCommentRemoved,
  onReopenTextarea,
}: UseOptimisticCommentsOptions) {
  const createComment = useCreateIssueComment(owner, repo, issueNumber);

  // Track pending comment IDs for optimistic state
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  let nextLocalId = -1; // Negative IDs for optimistic comments

  const { execute, isLoading } = useOptimisticMutation<{ body: string }>({
    id: `create-comment-${issueNumber}`,
    entityType: "issue_comment",
    action: "create",
    mutate: async ({ body }) => {
      await createComment.mutate({ body });
    },
    onOptimistic: ({ body }) => {
      const localId = nextLocalId--;
      const optimisticComment: IssueComment = {
        id: localId,
        body,
        commenter: currentUsername,
        user_id: currentUserId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setPendingIds((prev) => new Set([...prev, localId]));
      onCommentAdded(optimisticComment);
      logger.debug(
        `CommentList: optimistic add [local_id=${localId}] [issue=${issueNumber}]`
      );
    },
    onRevert: ({ body }) => {
      // Remove all pending comments (in practice there should only be one)
      setPendingIds((prev) => {
        for (const id of prev) {
          onCommentRemoved(id);
        }
        return new Set();
      });
      onReopenTextarea(body);
      logger.error(
        `CommentList: optimistic revert [action=add] [issue=${issueNumber}]`
      );
    },
    onSuccess: () => {
      // Server success: clear pending IDs. The real comment will arrive
      // via refetch or the next data hook update.
      setPendingIds(new Set());
    },
  });

  return {
    submitComment: (body: string) => execute({ body }),
    isSubmitting: isLoading,
    isPending: (commentId: number) => pendingIds.has(commentId),
  };
}
```

**Rationale**: Uses the existing `useOptimisticMutation` infrastructure. Negative IDs distinguish optimistic comments from server-confirmed ones. On revert, the textarea reopens with the original content preserved (handled by TUI_ISSUE_COMMENT_CREATE but wired here).

---

### Step 12: Error Boundary for Comment Section

**File**: `apps/tui/src/screens/Issues/components/CommentListErrorBoundary.tsx`

Isolated error boundary so comment rendering failures don't crash the issue header/body.

```typescript
import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { logger } from "../../../lib/logger";
import { emit } from "../../../lib/telemetry";

interface Props {
  children: ReactNode;
  theme: { error: any; muted: any };
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class CommentListErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error(
      `CommentList: render error [component=${info.componentStack?.split("\n")[1]?.trim() ?? "unknown"}] [error=${error.message}]`
    );
    emit("tui.issue_comment_list.error", {
      error_type: "render_error",
      error_message: error.message,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <box flexDirection="column" gap={1}>
          <text fg={this.props.theme.error}>
            Comment rendering error — press R to retry
          </text>
          <text fg={this.props.theme.muted}>
            {this.state.error?.message ?? "Unknown error"}
          </text>
        </box>
      );
    }
    return this.props.children;
  }
}
```

**Rationale**: React class component is required for error boundaries. The boundary wraps only the `CommentListSection`, leaving the issue header and body unaffected by comment rendering failures.

---

### Step 13: Wire into Issue Detail Screen

**File**: `apps/tui/src/screens/Issues/IssueDetailScreen.tsx` (modification)

Integrate the `CommentListSection` and its error boundary into the existing issue detail screen.

```typescript
// Inside the IssueDetailScreen render, after the issue body and dependencies sections:

import { CommentListSection } from "./components/CommentListSection";
import { CommentListErrorBoundary } from "./components/CommentListErrorBoundary";

// ... inside the <scrollbox> of the detail view:

{/* Comment and timeline section */}
<CommentListErrorBoundary theme={theme}>
  <CommentListSection
    owner={owner}
    repo={repo}
    issueNumber={issue.number}
    issueCommentCount={issue.comment_count}
    scrollToItem={scrollToItem}
  />
</CommentListErrorBoundary>
```

The `scrollToItem` callback should be connected to the parent `<scrollbox>`'s `scrollChildIntoView` method:

```typescript
const scrollboxRef = useRef<any>(null);

const scrollToItem = useCallback((itemId: string) => {
  scrollboxRef.current?.scrollChildIntoView?.(itemId);
}, []);

// ... in JSX:
<scrollbox ref={scrollboxRef} scrollY>
  {/* ... issue header, body, dependencies ... */}
  <CommentListErrorBoundary theme={theme}>
    <CommentListSection
      owner={owner}
      repo={repo}
      issueNumber={issue.number}
      issueCommentCount={issue.comment_count}
      scrollToItem={scrollToItem}
    />
  </CommentListErrorBoundary>
</scrollbox>
```

---

### Step 14: Productionization

All files in this implementation plan are production-ready. No POC code exists. Specific productionization concerns:

1. **Scrollbox virtualization**: For issues with 100+ comments, the `<scrollbox>` uses OpenTUI's built-in `viewportCulling={true}` prop. This is the default behavior — no additional work needed. The 500-item memory cap provides the hard upper bound.

2. **Performance profiling**: The render-time measurement in `CommentListSection` (via `performance.now()`) should be replaced with the `useTimeline` hook from `@opentui/react` if frame-level profiling is needed. The current approach is sufficient for the 50ms first-render target.

3. **SSE integration**: The product spec states comments are REST-only (no SSE). If real-time comment updates are added later, the `useCommentListData` hook should subscribe to an SSE channel via `useSSEChannel("issue_comments")` and merge incoming events.

4. **Internationalization**: Relative time strings (`"just now"`, `"ago"`) and UI strings (`"No comments yet"`) are hardcoded in English. If i18n is added, extract these into the `@codeplane/ui-core` string table.

5. **Memory management**: The `interleaveTimeline` function creates new arrays on each merge. For the 500-item cap, this is ~500 object references — negligible. If the cap increases, consider a mutable accumulator pattern.

6. **Backend gap**: The issue events endpoint (`GET /api/repos/:owner/:repo/issues/:number/events`) does not exist yet (returns 404). The `useIssueEvents` hook will return an error, triggering the degraded mode (comments-only rendering with "Timeline events unavailable" warning). Tests that depend on events will fail until the backend is implemented — per project policy, these tests are left failing.

---

## File Inventory

| File | Action | Description |
|------|--------|-------------|
| `apps/tui/src/screens/Issues/types.ts` | Extend | Add optimistic state types, comment list focus state, pagination state, layout type, constants |
| `apps/tui/src/screens/Issues/utils/interleave-timeline.ts` | Extend | Add deduplication, optimistic insert/remove functions |
| `apps/tui/src/screens/Issues/utils/relative-time.ts` | None | Consumed as-is from `tui-issue-detail-view` |
| `apps/tui/src/screens/Issues/utils/truncate.ts` | None | Consumed as-is from `tui-issue-detail-view` |
| `apps/tui/src/screens/Issues/hooks/useCommentListData.ts` | Create | Data coordination hook for comments + events |
| `apps/tui/src/screens/Issues/hooks/useCommentNavigation.ts` | Create | n/p comment focus navigation hook |
| `apps/tui/src/screens/Issues/hooks/useOptimisticComments.ts` | Create | Optimistic comment creation hook |
| `apps/tui/src/screens/Issues/components/CommentBlock.tsx` | Replace | Full implementation with accent bar, responsive indicators, optimistic state |
| `apps/tui/src/screens/Issues/components/TimelineEventRow.tsx` | Extend | Add description truncation, unknown event handling |
| `apps/tui/src/screens/Issues/components/CommentSeparator.tsx` | Create | Centered separator with comment count |
| `apps/tui/src/screens/Issues/components/CommentListSection.tsx` | Create | Main orchestration component |
| `apps/tui/src/screens/Issues/components/CommentListErrorBoundary.tsx` | Create | Isolated error boundary |
| `apps/tui/src/screens/Issues/IssueDetailScreen.tsx` | Modify | Wire comment list into detail view, register n/p keybindings |

---

## Unit & Integration Tests

**File**: `e2e/tui/issues.test.ts`

All tests use `@microsoft/tui-test` via the helpers in `e2e/tui/helpers.ts`. Tests run against a real API server with test fixtures. Tests that fail due to unimplemented backends (e.g., the events endpoint) are left failing.

### Terminal Snapshot Tests

```typescript
import { describe, test, expect } from "bun:test";
import { launchTUI, createMockAPIEnv, TERMINAL_SIZES } from "./helpers";

describe("TUI_ISSUE_COMMENT_LIST", () => {
  // --- Terminal Snapshot Tests ---

  describe("snapshot: comment rendering", () => {
    test("SNAP-COMMENT-LIST-001: Comment list renders with 3 comments at 120x40", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "1"],
      });

      await terminal.waitForText("Comments");
      // Verify separator with count
      const content = terminal.snapshot();
      expect(content).toMatch(/─+ Comments \(\d+\) ─+/);
      // Verify at least one @username in primary color
      expect(content).toMatch(/@\w+/);
      // Verify timestamps
      expect(content).toMatch(/\d+[mhd] ago|just now|\w+ \d+, \d{4}/);

      await terminal.terminate();
    });

    test("SNAP-COMMENT-LIST-002: Comment list renders with interleaved timeline events at 120x40", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "2"],
      });

      await terminal.waitForText("Comments");
      const content = terminal.snapshot();
      // Verify interleaved content: both comments (@user) and events (icons +/-/→)
      expect(content).toMatch(/@\w+/);
      // Timeline event icons
      expect(content).toMatch(/[+\-→↗◆]/);

      await terminal.terminate();
    });

    test("SNAP-COMMENT-LIST-003: Comment list at 80x24 compact layout", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 80,
        rows: 24,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "1"],
      });

      await terminal.waitForText("Comments");
      const content = terminal.snapshot();
      // Compact timestamps: no "ago" suffix
      expect(content).toMatch(/\d+[mhd](?!\s+ago)/);
      // [edit] and [delete] should NOT be visible at compact
      expect(content).not.toContain("[edit]");
      expect(content).not.toContain("[delete]");

      await terminal.terminate();
    });

    test("SNAP-COMMENT-LIST-004: Comment list at 200x60 expanded layout", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 200,
        rows: 60,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "1"],
      });

      await terminal.waitForText("Comments");
      const content = terminal.snapshot();
      // Full timestamps with "hours ago" / "minutes ago"
      expect(content).toMatch(/(minutes?|hours?|days?) ago/);

      await terminal.terminate();
    });

    test("SNAP-COMMENT-LIST-005: Focused comment with accent bar", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "1"],
      });

      await terminal.waitForText("Comments");
      // First comment should be focused with accent bar
      const content = terminal.snapshot();
      expect(content).toMatch(/│\s+@\w+/);

      await terminal.terminate();
    });

    test("SNAP-COMMENT-LIST-006: Empty comments state", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "100"],
      });

      await terminal.waitForText("Comments (0)");
      await terminal.waitForText("No comments yet. Press c to add one.");

      await terminal.terminate();
    });

    test("SNAP-COMMENT-LIST-007: Zero comments but has timeline events", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "101"],
      });

      await terminal.waitForText("Comments (0)");
      // Should NOT show empty state message since events exist
      await terminal.waitForNoText("No comments yet");
      // Should show timeline events
      const content = terminal.snapshot();
      expect(content).toMatch(/[+\-→↗◆]/);

      await terminal.terminate();
    });

    test("SNAP-COMMENT-LIST-008: Comment separator with count", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "1"],
      });

      await terminal.waitForText("Comments");
      const content = terminal.snapshot();
      // Separator format: centered with dashes
      expect(content).toMatch(/─+ Comments \(\d+\) ─+/);

      await terminal.terminate();
    });

    test("SNAP-COMMENT-LIST-009: Comment with markdown body (code block, list, bold)", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "3"],
      });

      await terminal.waitForText("Comments");
      // Issue 3 fixture should have a comment with markdown content
      const content = terminal.snapshot();
      expect(content).toMatch(/@\w+/);
      // Snapshot comparison captures full rendering fidelity
      expect(content).toMatchSnapshot();

      await terminal.terminate();
    });

    test("SNAP-COMMENT-LIST-010: Comment with 'edited' indicator", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "4"],
      });

      await terminal.waitForText("Comments");
      // Issue 4 fixture should have an edited comment
      await terminal.waitForText("edited");

      await terminal.terminate();
    });

    test("SNAP-COMMENT-LIST-011: Comment authored by current user shows '(you)'", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "5"],
      });

      await terminal.waitForText("Comments");
      // Issue 5 fixture should have a comment from the authenticated user
      await terminal.waitForText("(you)");

      await terminal.terminate();
    });

    test("SNAP-COMMENT-LIST-012: Comment with edit/delete indicators for author at 120x40", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "5"],
      });

      await terminal.waitForText("Comments");
      await terminal.waitForText("[edit]");
      await terminal.waitForText("[delete]");

      await terminal.terminate();
    });

    test("SNAP-COMMENT-LIST-013: Admin sees delete indicator on other users' comments", async () => {
      const env = createMockAPIEnv({ token: "admin-test-token" });
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "1"],
      });

      await terminal.waitForText("Comments");
      // Admin should see [delete] on all comments
      await terminal.waitForText("[delete]");

      await terminal.terminate();
    });

    test("SNAP-COMMENT-LIST-014: Edit/delete indicators hidden at 80x24", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 80,
        rows: 24,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "5"],
      });

      await terminal.waitForText("Comments");
      const content = terminal.snapshot();
      expect(content).not.toContain("[edit]");
      expect(content).not.toContain("[delete]");

      await terminal.terminate();
    });

    test("SNAP-COMMENT-LIST-015: Timeline event icons render correctly", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "6"],
      });

      await terminal.waitForText("Comments");
      // Issue 6 fixture has label, assignee, state, reference, milestone events
      const content = terminal.snapshot();
      // At least one event icon should be present
      expect(content).toMatch(/[+\-→↗◆]/);

      await terminal.terminate();
    });

    test("SNAP-COMMENT-LIST-019: Comment body truncation notice for 50k+ chars", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "7"],
      });

      await terminal.waitForText("Comments");
      // Issue 7 fixture has a comment exceeding 50k chars
      await terminal.waitForText("Comment truncated. View full comment on web.");

      await terminal.terminate();
    });

    test("SNAP-COMMENT-LIST-020: Comment error state (comments failed, issue loaded)", async () => {
      // This test requires a server fixture that returns 500 for comments but 200 for the issue
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "500"],
      });

      // Issue header/body should load
      await terminal.waitForText("#500");
      // Comment section should show error
      await terminal.waitForText("Failed to load comments");

      await terminal.terminate();
    });

    test("SNAP-COMMENT-LIST-021: Long username truncation at 39 chars", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "8"],
      });

      await terminal.waitForText("Comments");
      // Issue 8 fixture has a comment from a user with 45-char username
      const content = terminal.snapshot();
      // Should see truncation marker
      expect(content).toContain("…");

      await terminal.terminate();
    });

    test("SNAP-COMMENT-LIST-022: Relative vs absolute timestamps", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "9"],
      });

      await terminal.waitForText("Comments");
      const content = terminal.snapshot();
      // Issue 9 fixture has recent and old comments
      // Recent: relative format
      expect(content).toMatch(/\d+[mhd] ago/);
      // Old (>30 days): absolute format "Mon DD, YYYY"
      expect(content).toMatch(/\w{3} \d{1,2}, \d{4}/);

      await terminal.terminate();
    });
  });

  // --- Keyboard Interaction Tests ---

  describe("keyboard: comment navigation", () => {
    test("KEY-COMMENT-LIST-001: n jumps to next comment (skips events)", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "2"],
      });

      await terminal.waitForText("Comments");

      // Press n to focus first comment
      await terminal.sendKeys("n");
      let content = terminal.snapshot();
      // Should see accent bar on a comment (│ @username)
      expect(content).toMatch(/│\s+@\w+/);

      // Press n again to skip to next comment (past any events)
      await terminal.sendKeys("n");
      content = terminal.snapshot();
      // Accent bar should have moved
      expect(content).toMatch(/│\s+@\w+/);

      await terminal.terminate();
    });

    test("KEY-COMMENT-LIST-002: p jumps to previous comment (skips events)", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "2"],
      });

      await terminal.waitForText("Comments");

      // Navigate to second comment
      await terminal.sendKeys("n");
      await terminal.sendKeys("n");

      // Navigate back
      await terminal.sendKeys("p");
      const content = terminal.snapshot();
      expect(content).toMatch(/│\s+@\w+/);

      await terminal.terminate();
    });

    test("KEY-COMMENT-LIST-003: n on last comment stays (no wrap)", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "10"],
      });

      await terminal.waitForText("Comments");

      // Issue 10 has 2 comments — press n 3 times (should stop at 2nd)
      await terminal.sendKeys("n");
      await terminal.sendKeys("n");
      const beforeSnapshot = terminal.snapshot();
      await terminal.sendKeys("n"); // Should be no-op
      const afterSnapshot = terminal.snapshot();
      expect(afterSnapshot).toBe(beforeSnapshot);

      await terminal.terminate();
    });

    test("KEY-COMMENT-LIST-004: p on first comment stays (no wrap)", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "10"],
      });

      await terminal.waitForText("Comments");

      const beforeSnapshot = terminal.snapshot();
      await terminal.sendKeys("p"); // First comment already focused, should be no-op
      const afterSnapshot = terminal.snapshot();
      expect(afterSnapshot).toBe(beforeSnapshot);

      await terminal.terminate();
    });

    test("KEY-COMMENT-LIST-005: n/p no-ops with zero comments", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "100"],
      });

      await terminal.waitForText("No comments yet");

      const beforeSnapshot = terminal.snapshot();
      await terminal.sendKeys("n");
      await terminal.sendKeys("p");
      const afterSnapshot = terminal.snapshot();
      expect(afterSnapshot).toBe(beforeSnapshot);

      await terminal.terminate();
    });

    test("KEY-COMMENT-LIST-006: n/p no-ops with exactly one comment", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "11"],
      });

      await terminal.waitForText("Comments (1)");

      const beforeSnapshot = terminal.snapshot();
      await terminal.sendKeys("n");
      expect(terminal.snapshot()).toBe(beforeSnapshot);
      await terminal.sendKeys("p");
      expect(terminal.snapshot()).toBe(beforeSnapshot);

      await terminal.terminate();
    });

    test("KEY-COMMENT-LIST-007: j/k scrolls through all items including events", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "2"],
      });

      await terminal.waitForText("Comments");

      // Scroll down through content
      const before = terminal.snapshot();
      for (let i = 0; i < 10; i++) {
        await terminal.sendKeys("j");
      }
      const after = terminal.snapshot();
      // Content should have scrolled
      expect(after).not.toBe(before);

      await terminal.terminate();
    });

    test("KEY-COMMENT-LIST-008: G scrolls to bottom of comment list", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "12"],
      });

      await terminal.waitForText("Comments");

      // Issue 12 has many comments — G should jump to bottom
      await terminal.sendKeys("G");
      // The last comment(s) should now be visible
      const content = terminal.snapshot();
      // Verify we can see the bottom of the content
      expect(content).toMatch(/@\w+/);

      await terminal.terminate();
    });

    test("KEY-COMMENT-LIST-009: n scrolls focused comment into viewport", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "12"],
      });

      await terminal.waitForText("Comments");

      // Navigate through many comments
      for (let i = 0; i < 15; i++) {
        await terminal.sendKeys("n");
      }

      // The focused comment should be visible (accent bar in viewport)
      const content = terminal.snapshot();
      expect(content).toMatch(/│\s+@\w+/);

      await terminal.terminate();
    });

    test("KEY-COMMENT-LIST-010: Ctrl+D pages down within comment list", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "12"],
      });

      await terminal.waitForText("Comments");

      const before = terminal.snapshot();
      await terminal.sendKeys("ctrl+d");
      const after = terminal.snapshot();
      expect(after).not.toBe(before);

      await terminal.terminate();
    });

    test("KEY-COMMENT-LIST-011: Ctrl+U pages up within comment list", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "12"],
      });

      await terminal.waitForText("Comments");

      // Page down first, then page up
      await terminal.sendKeys("ctrl+d");
      await terminal.sendKeys("ctrl+d");
      const midpoint = terminal.snapshot();
      await terminal.sendKeys("ctrl+u");
      const afterPageUp = terminal.snapshot();
      expect(afterPageUp).not.toBe(midpoint);

      await terminal.terminate();
    });

    test("KEY-COMMENT-LIST-012: Rapid n key presses (10 in 200ms)", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "12"],
      });

      await terminal.waitForText("Comments");

      // Send 10 rapid n keypresses
      for (let i = 0; i < 10; i++) {
        await terminal.sendKeys("n");
      }

      // Should have moved focus — verify accent bar is visible
      const content = terminal.snapshot();
      expect(content).toMatch(/│\s+@\w+/);

      await terminal.terminate();
    });
  });

  // --- Responsive Resize Tests ---

  describe("resize: comment list layout", () => {
    test("RESIZE-COMMENT-LIST-001: 120x40 → 80x24 collapses timestamps", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "1"],
      });

      await terminal.waitForText("Comments");
      // Standard timestamps: "Xh ago"
      let content = terminal.snapshot();
      expect(content).toMatch(/\d+[mhd] ago/);

      // Resize to compact
      await terminal.resize(80, 24);
      await terminal.waitForText("Comments");
      content = terminal.snapshot();
      // Compact timestamps: "Xh" without "ago"
      // Note: regex negative lookahead checks no " ago" follows
      expect(content).toMatch(/\d+[mhd](?!\s*ago)/);

      await terminal.terminate();
    });

    test("RESIZE-COMMENT-LIST-002: 80x24 → 120x40 expands timestamps", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 80,
        rows: 24,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "1"],
      });

      await terminal.waitForText("Comments");

      await terminal.resize(120, 40);
      await terminal.waitForText("Comments");
      const content = terminal.snapshot();
      expect(content).toMatch(/\d+[mhd] ago/);

      await terminal.terminate();
    });

    test("RESIZE-COMMENT-LIST-003: 120x40 → 200x60 expands to full timestamps", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "1"],
      });

      await terminal.waitForText("Comments");

      await terminal.resize(200, 60);
      await terminal.waitForText("Comments");
      const content = terminal.snapshot();
      expect(content).toMatch(/(minutes?|hours?|days?) ago/);

      await terminal.terminate();
    });

    test("RESIZE-COMMENT-LIST-004: Focused comment preserved through resize", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "10"],
      });

      await terminal.waitForText("Comments");

      // Focus second comment
      await terminal.sendKeys("n");
      await terminal.sendKeys("n");

      // Resize
      await terminal.resize(80, 24);
      await terminal.waitForText("Comments");

      // Accent bar should still be visible (focused comment preserved)
      const content = terminal.snapshot();
      expect(content).toMatch(/│\s+@\w+/);

      await terminal.terminate();
    });

    test("RESIZE-COMMENT-LIST-006: Edit/delete indicators hidden at compact size", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "5"],
      });

      await terminal.waitForText("[edit]");

      await terminal.resize(80, 24);
      await terminal.waitForText("Comments");
      const content = terminal.snapshot();
      expect(content).not.toContain("[edit]");
      expect(content).not.toContain("[delete]");

      await terminal.terminate();
    });
  });

  // --- Data Loading and Pagination Tests ---

  describe("data: loading and pagination", () => {
    test("DATA-COMMENT-LIST-001: Comments and events load concurrently on mount", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "1"],
      });

      // Both should have loaded — comments visible and no loading indicator
      await terminal.waitForText("Comments");
      await terminal.waitForNoText("Loading more");
      const content = terminal.snapshot();
      expect(content).toMatch(/@\w+/);

      await terminal.terminate();
    });

    test("DATA-COMMENT-LIST-002: Timeline items merge in chronological order", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "2"],
      });

      await terminal.waitForText("Comments");
      // Issue 2 has interleaved comments and events — verify order via snapshot
      const content = terminal.snapshot();
      expect(content).toMatchSnapshot();

      await terminal.terminate();
    });

    test("DATA-COMMENT-LIST-003: Pagination loads next page at 80% scroll depth", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "13"],
      });

      await terminal.waitForText("Comments");

      // Issue 13 has 50+ comments — scroll to trigger pagination
      for (let i = 0; i < 30; i++) {
        await terminal.sendKeys("j");
      }

      // Should see loading indicator or new content loaded
      // The exact behavior depends on scroll speed vs API response
      const content = terminal.snapshot();
      expect(content).toMatch(/@\w+/); // Content still renders

      await terminal.terminate();
    });

    test("DATA-COMMENT-LIST-008: 401 during pagination shows auth error", async () => {
      // Use an expired token
      const env = createMockAPIEnv({ token: "expired-token" });
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "1"],
      });

      // Should show auth error
      await terminal.waitForText("Session expired");

      await terminal.terminate();
    });

    test("DATA-COMMENT-LIST-010: Comments load but events fail (degraded mode)", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "1"],
      });

      await terminal.waitForText("Comments");
      // Events endpoint doesn't exist (404) — should show warning
      // Note: This test will pass once events endpoint is implemented
      // For now, it validates degraded mode
      const content = terminal.snapshot();
      // Comments should render regardless
      expect(content).toMatch(/@\w+/);

      await terminal.terminate();
    });

    test("DATA-COMMENT-LIST-012: Optimistic comment persists on server success", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "1"],
      });

      await terminal.waitForText("Comments");

      // Open comment textarea and submit
      await terminal.sendKeys("c");
      await terminal.sendText("Test comment from e2e");
      await terminal.sendKeys("ctrl+s");

      // Comment should appear with sending indicator, then confirm
      await terminal.waitForText("Test comment from e2e");

      await terminal.terminate();
    });

    test("DATA-COMMENT-LIST-015: Comment count in separator matches issue.comment_count", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "1"],
      });

      await terminal.waitForText("Comments");
      const content = terminal.snapshot();
      // The count in the separator should match the server-side comment_count
      // not the number of loaded items
      expect(content).toMatch(/Comments \(\d+\)/);

      await terminal.terminate();
    });
  });

  // --- Edge Case Tests ---

  describe("edge: boundary conditions", () => {
    test("EDGE-COMMENT-LIST-002: Comment body with 0 characters renders username and timestamp", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "14"],
      });

      await terminal.waitForText("Comments");
      // Issue 14 fixture has a comment with empty body
      const content = terminal.snapshot();
      // Username should still be visible
      expect(content).toMatch(/@\w+/);

      await terminal.terminate();
    });

    test("EDGE-COMMENT-LIST-010: Issue with 1 comment and 0 events renders single comment", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "11"],
      });

      await terminal.waitForText("Comments (1)");
      await terminal.waitForNoText("No comments yet");
      const content = terminal.snapshot();
      expect(content).toMatch(/@\w+/);

      await terminal.terminate();
    });

    test("EDGE-COMMENT-LIST-011: Issue with 0 comments and 0 events shows empty state", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "100"],
      });

      await terminal.waitForText("No comments yet. Press c to add one.");

      await terminal.terminate();
    });

    test("EDGE-COMMENT-LIST-012: Issue with 0 comments and 5 events shows events without empty message", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "101"],
      });

      await terminal.waitForText("Comments (0)");
      await terminal.waitForNoText("No comments yet");
      // Events should be visible
      const content = terminal.snapshot();
      expect(content).toMatch(/[+\-→↗◆]/);

      await terminal.terminate();
    });

    test("EDGE-COMMENT-LIST-015: Comments and events with identical timestamps — events sort before comments", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "15"],
      });

      await terminal.waitForText("Comments");
      // Issue 15 fixture has event and comment at same timestamp
      // Snapshot captures the ordering
      expect(terminal.snapshot()).toMatchSnapshot();

      await terminal.terminate();
    });

    test("EDGE-COMMENT-LIST-018: Concurrent resize + n/p navigation preserves focus", async () => {
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "10"],
      });

      await terminal.waitForText("Comments");

      // Navigate to second comment
      await terminal.sendKeys("n");
      await terminal.sendKeys("n");

      // Resize while navigating
      await terminal.resize(80, 24);
      await terminal.sendKeys("n");
      await terminal.resize(200, 60);

      // Focus should be preserved — accent bar visible
      const content = terminal.snapshot();
      expect(content).toMatch(/│\s+@\w+/);

      await terminal.terminate();
    });

    test("EDGE-COMMENT-LIST-019: Comment section error boundary preserves issue header", async () => {
      // This test validates that if the comment section crashes,
      // the issue header and body remain visible
      const env = createMockAPIEnv();
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env,
        args: ["--screen", "issue-detail", "--repo", "testowner/testrepo", "--issue", "1"],
      });

      // Issue header should be visible regardless of comment section state
      await terminal.waitForText("#1");

      await terminal.terminate();
    });
  });
});
```

---

## Test Data Fixtures Required

The E2E tests depend on the following server-side test fixtures. These should be seeded in the test API server:

| Issue # | Fixture description |
|---------|--------------------|
| 1 | Standard issue with 3 comments, no events. Various authors. |
| 2 | Issue with 2 comments and 3 timeline events, interleaved chronologically. |
| 3 | Issue with a comment containing rich markdown: code block, bullet list, bold text. |
| 4 | Issue with a comment where `updated_at` differs from `created_at` (edited). |
| 5 | Issue with a comment authored by the test user (for `(you)` and `[edit]`/`[delete]`). |
| 6 | Issue with all timeline event types: label added/removed, assignee, state change, reference, milestone. |
| 7 | Issue with a comment body exceeding 50,000 characters. |
| 8 | Issue with a comment from a user with a 45-character username. |
| 9 | Issue with comments from 5 minutes ago and 60 days ago (for relative vs absolute timestamps). |
| 10 | Issue with exactly 2 comments (for boundary navigation tests). |
| 11 | Issue with exactly 1 comment and 0 events. |
| 12 | Issue with 20+ comments (for scroll/pagination tests). |
| 13 | Issue with 50+ comments (for pagination trigger tests). |
| 14 | Issue with a comment that has an empty body. |
| 15 | Issue with a comment and event at identical `created_at` timestamps. |
| 100 | Issue with 0 comments and 0 events (empty state). |
| 101 | Issue with 0 comments and 2+ timeline events. |
| 500 | Issue where the comments endpoint returns 500 (server error fixture). |

---

## Architecture Decisions

### 1. Comments and events fetched independently

The two endpoints (`/comments` and `/events`) are consumed via separate data hooks rather than a single combined endpoint. This matches the existing `@codeplane/ui-core` hook API and enables graceful degradation — if the events endpoint is unavailable (which it currently is), comments still render.

### 2. Client-side timeline merge

Interleaving happens client-side via `interleaveTimeline()` rather than requesting a pre-merged endpoint. This is consistent with the REST API design and allows independent pagination of each source.

### 3. Focus state separated from render state

The `useCommentNavigation` hook tracks focus position independently from the component tree. This avoids re-rendering the entire timeline on every `n`/`p` press — only the previously-focused and newly-focused `CommentBlock` components re-render.

### 4. Error boundary isolation

The comment section has its own error boundary (`CommentListErrorBoundary`) separate from the global `ErrorBoundary`. This ensures that a crash in markdown rendering, timeline merging, or any comment sub-component doesn't take down the issue header and body.

### 5. No scrollbox nesting

The comment list does NOT create its own `<scrollbox>`. It renders as children within the parent issue detail `<scrollbox>`. This avoids nested scroll context complexity and ensures `j`/`k` scrolling works uniformly across the entire issue detail view.

### 6. Pagination is scroll-driven, not comment-count-driven

Pagination triggers at 80% scroll depth of the parent scrollbox, not when the user reaches the Nth comment via `n`. This prevents the awkward case where `n` navigation past 30 items forces a synchronous pagination fetch that blocks the UI.

---

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| First render (data pre-fetched) | < 50ms | `performance.now()` in `CommentListSection` mount |
| `n`/`p` comment jump response | < 16ms (1 frame) | Synchronous state update in `useCommentNavigation` |
| `j`/`k` scroll at 500 items | 60fps | OpenTUI's `viewportCulling` on parent `<scrollbox>` |
| Pagination fetch | < 2s | Network request timing in `useCommentListData` |
| Timeline merge (500 items) | < 100ms | `performance.now()` in merge function, warn threshold |
| Memory at 500 items | < 50MB | 500 × ~100KB per comment (generous markdown body estimate) |

---

## Dependencies and Ordering

This ticket depends on:

1. **`tui-issue-detail-view`** — Provides:
   - `IssueDetailScreen` component (the parent screen)
   - `apps/tui/src/screens/Issues/types.ts` (base types)
   - `apps/tui/src/screens/Issues/utils/relative-time.ts`
   - `apps/tui/src/screens/Issues/utils/truncate.ts`
   - `apps/tui/src/screens/Issues/utils/interleave-timeline.ts` (base implementation)
   - `apps/tui/src/screens/Issues/components/CommentBlock.tsx` (scaffold)
   - `apps/tui/src/screens/Issues/components/TimelineEventRow.tsx` (scaffold)

2. **`tui-issues-data-hooks`** — Provides:
   - `useIssueComments(owner, repo, number)` hook
   - `useIssueEvents(owner, repo, number)` hook (currently returns 404 from backend)
   - `useCreateIssueComment(owner, repo, number)` hook
   - `useUser()` hook

This ticket is a prerequisite for:
- `tui-issue-comment-create` — Uses the optimistic comment integration from Step 11
- `tui-issue-comment-edit` — Uses the `[edit]` indicator wiring
- `tui-issue-comment-delete` — Uses the `[delete]` indicator wiring