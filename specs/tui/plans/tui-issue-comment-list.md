# Implementation Plan: TUI Issue Comment List

**Ticket**: `tui-issue-comment-list`
**Title**: Paginated chronological comment and timeline event display with interleaving

## Overview
This plan implements the comment and timeline event display within the issue detail screen. Based on current codebase research, the prerequisite ticket `tui-issue-detail-view` is not yet merged, and `@codeplane/ui-core` is currently absent. Therefore, this implementation will fully create the required base types, utilities, and components (rather than just extending them) and properly map terminal breakpoints (`minimum`, `standard`, `large`) to component layout tiers.

---

## Step 1: Types and Constants
**File**: `apps/tui/src/screens/Issues/types.ts`
Create this file from scratch to define all necessary types.

```typescript
import type { IssueComment, IssueEvent } from "@codeplane/ui-core"; // Assumed to exist/mocked

export type OptimisticState = "confirmed" | "pending" | "failed";

export interface CommentWithOptimisticState {
  comment: IssueComment;
  optimisticState: OptimisticState;
  localId?: string;
}

export interface CommentListFocusState {
  focusedCommentPosition: number;
  focusedTimelineIndex: number;
}

export interface CommentListPaginationState {
  commentsCursor: string | null;
  eventsCursor: string | null;
  commentsHasMore: boolean;
  eventsHasMore: boolean;
  isLoadingMore: boolean;
  totalItemsLoaded: number;
  isCapped: boolean;
}

export type CommentListLayout = "compact" | "standard" | "expanded";

export type TimelineCommentItem = { type: "comment"; id: number; sortKey: string; comment: IssueComment };
export type TimelineEventItem = { type: "event"; id: number; sortKey: string; event: IssueEvent };
export type TimelineItem = TimelineCommentItem | TimelineEventItem;

export const MAX_TIMELINE_ITEMS = 500;
export const TIMELINE_PAGE_SIZE = 30;
export const MAX_USERNAME_LENGTH = 39;
export const COMMENT_BODY_TRUNCATION_NOTICE = "Comment truncated. View full comment on web.";
export const ITEMS_CAPPED_NOTICE_PREFIX = "Showing";
export const ITEMS_CAPPED_NOTICE_SUFFIX = "items. View full history on web.";
export const EMPTY_COMMENTS_MESSAGE = "No comments yet. Press c to add one.";
export const TIMELINE_EVENTS_UNAVAILABLE = "Timeline events unavailable";
export const COMMENTS_LOAD_FAILED = "Failed to load comments";
export const COMMENTS_AND_EVENTS_FAILED = "Failed to load comments and timeline";
export const PAGINATION_SCROLL_THRESHOLD = 0.8;
export const PAGINATION_DEDUP_COOLDOWN_MS = 200;

export const EVENT_ICONS: Record<string, string> = {
  label_added: "+",
  label_removed: "-",
  assignee_added: "↗",
  assignee_removed: "↘",
  state_changed: "→",
  referenced: "◆",
  milestone_changed: "⚑",
};
```

## Step 2: Utilities

**File**: `apps/tui/src/screens/Issues/utils/interleave-timeline.ts`
Create the timeline interleaving logic with deduplication.
```typescript
import type { IssueComment, IssueEvent } from "@codeplane/ui-core";
import type { TimelineItem, TimelineCommentItem, TimelineEventItem } from "../types";
import { MAX_TIMELINE_ITEMS } from "../types";

export function interleaveTimeline(comments: IssueComment[], events: IssueEvent[]): TimelineItem[] {
  const seen = new Set<string>();
  const commentItems: TimelineCommentItem[] = [];
  for (const c of comments) {
    const key = `comment:${c.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    commentItems.push({ type: "comment", id: c.id, sortKey: c.created_at, comment: c });
  }

  const eventItems: TimelineEventItem[] = [];
  for (const e of events) {
    const key = `event:${e.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    eventItems.push({ type: "event", id: e.id, sortKey: e.createdAt, event: e });
  }

  const merged = [...commentItems, ...eventItems].sort((a, b) => {
    const cmp = a.sortKey.localeCompare(b.sortKey);
    if (cmp !== 0) return cmp;
    if (a.type === "event" && b.type === "comment") return -1;
    if (a.type === "comment" && b.type === "event") return 1;
    return 0;
  });

  return merged.slice(0, MAX_TIMELINE_ITEMS);
}

export function getCommentIndices(items: TimelineItem[]): number[] {
  return items.map((item, index) => (item.type === "comment" ? index : -1)).filter((i) => i !== -1);
}
```

**File**: `apps/tui/src/screens/Issues/utils/relative-time.ts`
```typescript
export type TimestampFormat = "compact" | "standard" | "full";
export function relativeTime(dateString: string, format: TimestampFormat): string {
  // Implementation of relative time mapping (e.g. "2h" vs "2h ago" vs "2 hours ago")
  return dateString; // Placeholder logic
}
```

**File**: `apps/tui/src/screens/Issues/utils/truncate.ts`
```typescript
export function truncateCommentBody(body: string) {
  const TRUNCATION_LIMIT = 50000;
  if (body.length > TRUNCATION_LIMIT) return { text: body.slice(0, TRUNCATION_LIMIT), truncated: true };
  return { text: body, truncated: false };
}

export function truncateUsername(username: string) {
  return username.length > 39 ? username.slice(0, 38) + "…" : username;
}
```

## Step 3: Data Hooks
**File**: `apps/tui/src/screens/Issues/hooks/useCommentListData.ts`
Implement `useCommentListData` hook assuming `@codeplane/ui-core` API structure.

**File**: `apps/tui/src/screens/Issues/hooks/useCommentNavigation.ts`
Implement navigation state, handling `n`/`p` jumps across comment indices and skipping events.

## Step 4: Components

**File**: `apps/tui/src/screens/Issues/components/CommentBlock.tsx`
Render individual comments, adjusting for `layout === "compact"` to hide `[edit]` and `[delete]`.

**File**: `apps/tui/src/screens/Issues/components/TimelineEventRow.tsx`
Render timeline events, applying truncations correctly for the compact layout.

**File**: `apps/tui/src/screens/Issues/components/CommentSeparator.tsx`
Render horizontal separator `─── Comments (N) ───` adjusting dashes to available terminal width.

**File**: `apps/tui/src/screens/Issues/components/CommentListErrorBoundary.tsx`
Wrap the comment section to prevent localized comment failures from crashing the issue detail view.

**File**: `apps/tui/src/screens/Issues/components/CommentListSection.tsx`
Main orchestration component. Mappings account for actual responsive UI breakpoints from TUI (`minimum` -> `compact`):
```typescript
import React, { useMemo } from "react";
import { useBreakpoint } from "../../../hooks/useBreakpoint";

export function CommentListSection({ owner, repo, issueNumber, issueCommentCount, scrollToItem }: any) {
  const breakpoint = useBreakpoint();
  
  const commentLayout: CommentListLayout = useMemo(() => {
    if (!breakpoint || breakpoint === "minimum") return "compact";
    if (breakpoint === "large") return "expanded";
    return "standard";
  }, [breakpoint]);

  // ... hook wire-ups and render logic
}
```

## Step 5: Screen Integration
**File**: `apps/tui/src/screens/Issues/IssueDetailScreen.tsx`
Create or modify this to include the `CommentListErrorBoundary` wrapping `CommentListSection`. Add the `n`/`p` hotkeys to the `useScreenKeybindings` array.

## Step 6: Testing
**File**: `e2e/tui/issues.test.ts`
Implement snapshot tests and keyboard interactions based on the provided spec. Ensure all test dependencies on `@microsoft/tui-test` and local mock environments are correctly instantiated. Unimplemented backends like `/events` will gracefully error per the `CommentListSection` degradation logic, and those tests will remain failing until the backend is fully available.