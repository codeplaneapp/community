# Engineering Specification: TUI Agent Session List Screen

**Ticket:** `tui-agent-session-list`
**Feature:** `TUI_AGENT_SESSION_LIST`
**Status:** `Partial`
**Dependencies:** `tui-agent-data-hooks`, `tui-agent-screen-registry`, `tui-agent-e2e-scaffolding`

---

## 1. Overview

This specification describes the implementation of the Agent Session List screen — the primary entry point for all agent interactions within a repository in the Codeplane TUI. The screen renders a full-screen, scrollable, filterable list of agent sessions with real-time SSE updates, page-based pagination, and CRUD actions.

The screen is reached via `g a` go-to keybinding, `:agents` command palette entry, or `codeplane tui --screen agents --repo owner/repo` deep-link. It requires an active repository context.

---

## 2. Current State Assessment

### Production Files (in `apps/tui/src/`)

The production `apps/tui/src/screens/Agents/` directory is minimal:

| File | State | Contents |
|------|-------|----------|
| `types.ts` | 16 lines | `MessageRole`, `MessagePart`, `AgentMessage`, `Breakpoint` — message/chat types only. **Missing** session list types (`SessionStatusFilter`, `STATUS_FILTER_CYCLE`, etc.) |
| `components/index.ts` | 2 lines | Re-exports only `MessageBlock` and `ToolBlock` |
| `components/MessageBlock.tsx` | 1 line | Empty module (`export {};`) |
| `components/ToolBlock.tsx` | 1 line | Empty module (`export {};`) |
| `utils/formatTimestamp.ts` | 33 lines | Complete relative timestamp formatter — production-quality with breakpoint-aware formatting |

Notably absent from production:
- `AgentSessionListScreen.tsx` (main screen component)
- `SessionRow.tsx`, `SessionFilterToolbar.tsx`, `DeleteConfirmationOverlay.tsx`, `SessionEmptyState.tsx`
- All hooks (`useSessionFilter`, `useSessionListKeybindings`, `useSessionListSSE`)
- All utility modules except `formatTimestamp` (`sessionStatusIcon`, `sessionListColumns`, `formatDuration`, `formatMessageCount`, `formatTotalCount`, `truncateTitle`)
- No `hooks/` directory under Agents
- No screen index file (`index.ts`)
- No router or screen registry (the `apps/tui/src/router/` directory does not exist in production)

### Reference Files (in `specs/tui/apps/tui/src/`)

Complete reference implementations exist for every file needed:

| File | Lines | State |
|------|-------|-------|
| `screens/Agents/AgentSessionListScreen.tsx` | 245 | Functional — all state management, data fetching, filtering, rendering. Stubs for `useTerminalDimensions`, `useKeyboard`, theme colors |
| `screens/Agents/components/SessionRow.tsx` | 47 | Renders `{icon} {title}` (interim). Full theme-aware render in comments |
| `screens/Agents/components/SessionFilterToolbar.tsx` | 21 | Renders `Filter: {label}` (interim). Full toolbar with `<input>` in comments |
| `screens/Agents/components/DeleteConfirmationOverlay.tsx` | 22 | Minimal `<box position="absolute">`. Full overlay in comments |
| `screens/Agents/components/SessionEmptyState.tsx` | 40 | Complete logic with all 3 empty reasons |
| `screens/Agents/components/index.ts` | 8 | Barrel with all exports |
| `screens/Agents/hooks/useSessionFilter.ts` | 59 | Complete — filter cycling, search, empty reason derivation |
| `screens/Agents/hooks/useSessionListKeybindings.ts` | 64 | Stub body with stable interface. Key dispatch in comments |
| `screens/Agents/hooks/useSessionListSSE.ts` | 23 | No-op stub. Stable signature |
| `screens/Agents/utils/sessionStatusIcon.ts` | 14 | Complete mapping |
| `screens/Agents/utils/sessionListColumns.ts` | 38 | Complete column calculator for all 3 breakpoints |
| `screens/Agents/utils/formatDuration.ts` | 16 | Complete |
| `screens/Agents/utils/formatMessageCount.ts` | 5 | Complete |
| `screens/Agents/utils/formatTotalCount.ts` | 4 | Complete |
| `screens/Agents/utils/truncateTitle.ts` | 15 | Complete with `Intl.Segmenter` grapheme awareness |
| `screens/Agents/types.ts` | 61 | Complete with session list types |
| `screens/Agents/index.ts` | 5 | Exports all 4 screen components |
| `router/registry.ts` | 217 | 45-screen registry (all pointing to `PlaceholderScreen`) |
| `router/types.ts` | 105 | `ScreenName` enum, `ScreenEntry`, `NavigationContext`, `ScreenDefinition` |
| `router/ScreenRouter.tsx` | 30 | Renders top-of-stack screen |

### Test Files (in `specs/tui/e2e/tui/`)

| File | State |
|------|-------|
| `agents.test.ts` | 121 test stubs for `TUI_AGENT_SESSION_LIST` (lines 449–595). All have correct IDs and descriptions. Bodies empty (except KEY-AGENT-LIST-001 which has a commented-out example) |
| `helpers.ts` | Complete with `launchTUI`, `navigateToAgents`, `waitForSessionListReady`, `navigateToAgentChat`, `waitForChatReady`, credential helpers |

The E2E test directory in production (`e2e/tui/`) currently contains only `diff.test.ts`.

---

## 3. File Inventory

### Source Files (all under `apps/tui/src/`)

| File | Purpose | Action |
|------|---------|--------|
| `screens/Agents/AgentSessionListScreen.tsx` | Main screen component | **New** (promote from specs) |
| `screens/Agents/components/SessionRow.tsx` | Single session row renderer | **New** (promote from specs) |
| `screens/Agents/components/SessionFilterToolbar.tsx` | Status filter + search input toolbar | **New** (promote from specs) |
| `screens/Agents/components/DeleteConfirmationOverlay.tsx` | Delete confirmation modal | **New** (promote from specs) |
| `screens/Agents/components/SessionEmptyState.tsx` | Empty/filtered/search-miss states | **New** (promote from specs) |
| `screens/Agents/components/index.ts` | Barrel re-exports | **Modify** (add new exports) |
| `screens/Agents/hooks/useSessionFilter.ts` | Client-side filter and search state machine | **New** (promote from specs) |
| `screens/Agents/hooks/useSessionListKeybindings.ts` | Screen-specific keybinding registration | **New** (promote from specs) |
| `screens/Agents/hooks/useSessionListSSE.ts` | SSE subscription for real-time status updates | **New** (promote from specs) |
| `screens/Agents/utils/sessionStatusIcon.ts` | Status → icon/color/fallback mapping | **New** (promote from specs) |
| `screens/Agents/utils/sessionListColumns.ts` | Responsive column layout calculator | **New** (promote from specs) |
| `screens/Agents/utils/formatDuration.ts` | Duration formatting (`Xs`, `Xm Ys`, `Xh Ym`, `—`) | **New** (promote from specs) |
| `screens/Agents/utils/formatMessageCount.ts` | Message count formatting (`N msgs`, `9999+`) | **New** (promote from specs) |
| `screens/Agents/utils/formatTotalCount.ts` | Total count formatting (`N`, `9999+`) | **New** (promote from specs) |
| `screens/Agents/utils/truncateTitle.ts` | Grapheme-cluster-aware title truncation | **New** (promote from specs) |
| `screens/Agents/types.ts` | Extended with session list types | **Modify** (add session list types to existing file) |
| `screens/Agents/index.ts` | Screen exports | **New** (promote from specs) |

### Infrastructure Files (when router ships)

| File | Change |
|------|--------|
| `router/registry.ts` | Replace `PlaceholderScreen` with `AgentSessionListScreen` for `AgentSessionList` entry |
| `router/types.ts` | Ensure `AgentSessionList` is in `ScreenName` enum |

### Test Files (all under `e2e/tui/`)

| File | Purpose | Action |
|------|---------|--------|
| `agents.test.ts` | All 121 session list tests | **New** (promote from specs, populate bodies) |
| `helpers.ts` | Agent-specific test helpers | **New** (promote from specs) |

---

## 4. Implementation Plan

Implementation is structured as 9 vertical steps. Each step is independently testable. Steps 1–2 are pure functions with zero React/OpenTUI dependencies. Steps 3–5 are hooks. Steps 6–7 are components. Steps 8–9 are integration.

### Step 1: Type Definitions and Utility Functions

**Goal:** Establish data types and pure formatting functions. Zero React/OpenTUI dependencies. Unit testable in isolation.

#### 1.1 Extend `apps/tui/src/screens/Agents/types.ts`

The file currently contains `MessageRole`, `MessagePart`, `AgentMessage`, and `Breakpoint`. Add session list types after the existing content:

```typescript
// ── Existing types remain unchanged ──

import type { AgentSessionStatus } from "@codeplane/ui-core";

export type SessionStatusFilter = "all" | "active" | "completed" | "failed" | "timed_out";

export const STATUS_FILTER_CYCLE: readonly SessionStatusFilter[] = [
  "all", "active", "completed", "failed", "timed_out",
] as const;

export const STATUS_FILTER_LABELS: Record<SessionStatusFilter, string> = {
  all: "All", active: "Active", completed: "Completed",
  failed: "Failed", timed_out: "Timed Out",
};

export interface StatusIconConfig {
  icon: string;
  fallback: string;
  color: string;   // semantic token key: "success" | "error" | "warning" | "muted"
  bold: boolean;
}

export interface SessionListColumn {
  field: "icon" | "idPrefix" | "title" | "messageCount" | "duration" | "timestamp";
  width: number;
  visible: boolean;
}
```

The existing `Breakpoint` type is defined inline as `type Breakpoint = "minimum" | "standard" | "large"`. Keep the inline definition. The reference spec's `export type { Breakpoint } from "../../types/breakpoint.js"` re-export pattern can be adopted if/when `types/breakpoint.ts` is promoted to production (it currently exists only in specs).

#### 1.2 Create `apps/tui/src/screens/Agents/utils/sessionStatusIcon.ts`

Pure mapping from `AgentSessionStatus` to icon config. No dependencies beyond types.

```typescript
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
```

#### 1.3 Create `apps/tui/src/screens/Agents/utils/formatDuration.ts`

Formats elapsed time between `startedAt` and `finishedAt` (or `Date.now()` if still active).

```typescript
export function formatDuration(
  startedAt: string | null | undefined,
  finishedAt: string | null | undefined,
): string {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const diffSec = Math.max(0, Math.floor((end - start) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const minutes = Math.floor(diffSec / 60);
  const seconds = diffSec % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  return `${hours}h ${remainingMin}m`;
}
```

**Boundary behavior:**
- `startedAt === null` → `"—"`
- `startedAt` set, `finishedAt === null` → duration calculated against `Date.now()` (live timer for active sessions)
- Negative difference (clock skew) → clamped to `0s`

#### 1.4 Create `apps/tui/src/screens/Agents/utils/formatMessageCount.ts`

```typescript
export function formatMessageCount(count: number | undefined | null): string {
  if (count === undefined || count === null) return "0 msgs";
  if (count >= 10000) return "9999+";
  return `${count} msgs`;
}
```

Note: `msgs` fits within the 8ch column width at standard and large breakpoints.

#### 1.5 Create `apps/tui/src/screens/Agents/utils/formatTotalCount.ts`

```typescript
export function formatTotalCount(total: number): string {
  if (total > 9999) return "9999+";
  return String(total);
}
```

#### 1.6 Create `apps/tui/src/screens/Agents/utils/truncateTitle.ts`

Grapheme-cluster-aware truncation using `Intl.Segmenter`. Handles null/empty titles with a fallback.

```typescript
export function truncateTitle(
  title: string | null | undefined,
  maxWidth: number,
): { text: string; isMuted: boolean; isItalic: boolean } {
  if (!title || title.trim().length === 0) {
    return { text: "Untitled session", isMuted: true, isItalic: true };
  }
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const graphemes = [...segmenter.segment(title)].map(s => s.segment);
  if (graphemes.length <= maxWidth) {
    return { text: title, isMuted: false, isItalic: false };
  }
  const truncated = graphemes.slice(0, maxWidth - 1).join("") + "…";
  return { text: truncated, isMuted: false, isItalic: false };
}
```

**Why `Intl.Segmenter`:** Emoji sequences like 👨‍👩‍👧‍👦 are single grapheme clusters but multiple code points. Naive `String.prototype.slice` would break them. Bun supports `Intl.Segmenter` natively.

#### 1.7 Existing `apps/tui/src/screens/Agents/utils/formatTimestamp.ts`

This file already exists in production and is complete. It handles all 3 breakpoints with relative timestamp formatting. **No changes needed.** However, note the reference spec version uses `toLocaleString()` while the production version uses manual relative time math. The production version is superior (deterministic, testable). Keep it.

---

### Step 2: Column Layout Calculator

**File:** `apps/tui/src/screens/Agents/utils/sessionListColumns.ts`

Pure function. No React dependency. Computes column visibility and widths per breakpoint.

```typescript
import type { Breakpoint, SessionListColumn } from "../types.js";

export function getSessionListColumns(
  breakpoint: Breakpoint,
  terminalWidth: number,
): SessionListColumn[] {
  switch (breakpoint) {
    case "minimum": {
      // 2ch icon + 2ch gap + 4ch timestamp = 8ch overhead
      const titleWidth = Math.max(10, terminalWidth - 8);
      return [
        { field: "icon", width: 2, visible: true },
        { field: "idPrefix", width: 0, visible: false },
        { field: "title", width: titleWidth, visible: true },
        { field: "messageCount", width: 0, visible: false },
        { field: "duration", width: 0, visible: false },
        { field: "timestamp", width: 4, visible: true },
      ];
    }
    case "standard":
      return [
        { field: "icon", width: 2, visible: true },
        { field: "idPrefix", width: 0, visible: false },
        { field: "title", width: 40, visible: true },
        { field: "messageCount", width: 8, visible: true },
        { field: "duration", width: 0, visible: false },
        { field: "timestamp", width: 4, visible: true },
      ];
    case "large":
      return [
        { field: "icon", width: 2, visible: true },
        { field: "idPrefix", width: 10, visible: true },
        { field: "title", width: 50, visible: true },
        { field: "messageCount", width: 8, visible: true },
        { field: "duration", width: 8, visible: true },
        { field: "timestamp", width: 6, visible: true },
      ];
  }
}
```

**Column budget per breakpoint:**
- Minimum (80ch): `2 + titleWidth + 4 = 80` → `titleWidth = 74` (minimum clamped to 10)
- Standard (120ch): `2 + 40 + 8 + 4 = 54` (remaining space used for gaps between columns)
- Large (200ch): `2 + 10 + 50 + 8 + 8 + 6 = 84` (remaining space used for generous gaps)

---

### Step 3: Session Filter and Search Hook

**File:** `apps/tui/src/screens/Agents/hooks/useSessionFilter.ts`

Client-side filtering and search state machine. Complete implementation.

```typescript
import { useState, useMemo, useCallback } from "react";
import type { AgentSession } from "@codeplane/ui-core";
import { STATUS_FILTER_CYCLE } from "../types.js";
import type { SessionStatusFilter } from "../types.js";

export interface UseSessionFilterResult {
  filteredSessions: AgentSession[];
  activeFilter: SessionStatusFilter;
  searchQuery: string;
  isSearchFocused: boolean;
  cycleFilter: () => void;
  setSearchQuery: (query: string) => void;
  setSearchFocused: (focused: boolean) => void;
  clearSearch: () => void;
  emptyReason: "none" | "zero_sessions" | "filter_empty" | "search_empty";
}

export function useSessionFilter(sessions: AgentSession[]): UseSessionFilterResult {
  const [activeFilter, setActiveFilter] = useState<SessionStatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setSearchFocused] = useState(false);

  const cycleFilter = useCallback(() => {
    setActiveFilter(current => {
      const idx = STATUS_FILTER_CYCLE.indexOf(current);
      return STATUS_FILTER_CYCLE[(idx + 1) % STATUS_FILTER_CYCLE.length];
    });
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchFocused(false);
  }, []);

  const filteredSessions = useMemo(() => {
    let result = sessions;
    if (activeFilter !== "all") {
      result = result.filter(s => s.status === activeFilter);
    }
    if (searchQuery.trim().length > 0) {
      const query = searchQuery.toLowerCase();
      result = result.filter(s => (s.title || "").toLowerCase().includes(query));
    }
    return result;
  }, [sessions, activeFilter, searchQuery]);

  const emptyReason = useMemo((): UseSessionFilterResult["emptyReason"] => {
    if (filteredSessions.length > 0) return "none";
    if (sessions.length === 0) return "zero_sessions";
    if (searchQuery.trim().length > 0) return "search_empty";
    if (activeFilter !== "all") return "filter_empty";
    return "zero_sessions";
  }, [filteredSessions.length, sessions.length, searchQuery, activeFilter]);

  return {
    filteredSessions, activeFilter, searchQuery, isSearchFocused,
    cycleFilter, setSearchQuery, setSearchFocused, clearSearch, emptyReason,
  };
}
```

**Key design decisions:**
- Search is a **literal substring match**, not regex. Characters like `.` or `*` match literally (satisfies EDGE-AGENT-LIST-006).
- Filter and search compose: a session must pass both the status filter AND the search query.
- `emptyReason` is derived, not stored — priority: `zero_sessions` > `search_empty` > `filter_empty`.
- Search input max 120 characters enforced at the `<input>` component level, not here.

---

### Step 4: SSE Subscription Hook

**File:** `apps/tui/src/screens/Agents/hooks/useSessionListSSE.ts`

```typescript
import type { AgentSessionStatus } from "@codeplane/ui-core";

export interface SSESessionUpdate {
  sessionId: string;
  newStatus: AgentSessionStatus;
  updatedAt: string;
  messageCount?: number;
}

/**
 * Subscribes to SSE channel `agent_session_{repoId}` for real-time
 * session status changes.
 *
 * Current state: No-op stub.
 * Productionize: Replace body with useSSEChannel(channelName, handler)
 * from SSEProvider. The function signature is stable and will not change.
 */
export function useSessionListSSE(
  repoId: string | undefined,
  onSessionUpdate: (update: SSESessionUpdate) => void,
): void {
  // No-op stub. Will integrate with SSEProvider's useSSEChannel hook.
  // Channel: `agent_session_${repoId}`
}
```

**SSE event shape (expected from server):**
```json
{
  "type": "session_status_change",
  "data": {
    "sessionId": "uuid",
    "status": "completed",
    "updatedAt": "2026-03-22T...",
    "messageCount": 8
  }
}
```

**Integration contract with `AgentSessionListScreen`:** When an SSE update arrives, the screen must:
1. Find the session by `sessionId` in the loaded list
2. Update its `status`, `updatedAt`, and optionally `messageCount` in-place
3. Re-render the row (icon changes, bold/normal weight changes)
4. NOT change scroll position or focus index
5. If the session is not in the loaded list (paginated out), ignore the event

---

### Step 5: Screen-Specific Keybinding Hook

**File:** `apps/tui/src/screens/Agents/hooks/useSessionListKeybindings.ts`

```typescript
import { useEffect, useRef } from "react";

export interface SessionListKeybindingActions {
  moveFocusDown: () => void;
  moveFocusUp: () => void;
  jumpToFirst: () => void;
  jumpToLast: () => void;
  pageDown: () => void;
  pageUp: () => void;
  openSession: () => void;
  createSession: () => void;
  deleteSession: () => void;
  replaySession: () => void;
  cycleFilter: () => void;
  focusSearch: () => void;
  toggleSelection: () => void;
  retryFetch: () => void;
  popScreen: () => void;
  clearSearch: () => void;
  confirmDelete: () => void;
  cancelDelete: () => void;
  isSearchFocused: boolean;
  isOverlayOpen: boolean;
  isErrorState: boolean;
  hasSearchText: boolean;
}

/**
 * Registers keybindings for the AgentSessionListScreen.
 *
 * Priority chain (highest to lowest):
 * 1. Search input focused → printable keys type into input; Esc clears search.
 * 2. Delete overlay open → Enter confirms, Esc cancels. All other keys are no-ops.
 * 3. Screen-specific: j/k/Down/Up/Enter/n/d/r/f/G/gg/Space/q/R/Ctrl+D/Ctrl+U.
 * 4. Global (handled by KeybindingProvider): ?/:/ Ctrl+C.
 *
 * Go-to mode (g prefix) is handled at the KeybindingProvider level.
 * The `g g` sequence resolves to jumpToFirst via go-to mode timeout.
 */
export function useSessionListKeybindings(
  actions: SessionListKeybindingActions,
  statusBarHints: string,
): void {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // Stub: will use useKeyboard from @opentui/react.
  // Key dispatch logic:
  //
  // useKeyboard((key, modifiers) => {
  //   const a = actionsRef.current;
  //
  //   // Priority 1: Search input captures printable keys
  //   if (a.isSearchFocused) {
  //     if (key === "Escape") { a.clearSearch(); return; }
  //     return; // let <input> handle the key
  //   }
  //
  //   // Priority 2: Delete overlay captures Enter/Esc
  //   if (a.isOverlayOpen) {
  //     if (key === "Return") { a.confirmDelete(); return; }
  //     if (key === "Escape") { a.cancelDelete(); return; }
  //     return; // swallow all other keys
  //   }
  //
  //   // Priority 3: Screen-specific
  //   switch (key) {
  //     case "j": case "ArrowDown": a.moveFocusDown(); break;
  //     case "k": case "ArrowUp":   a.moveFocusUp(); break;
  //     case "Return":              a.openSession(); break;
  //     case "G":                   a.jumpToLast(); break;
  //     case "n":                   a.createSession(); break;
  //     case "d":                   a.deleteSession(); break;
  //     case "r":                   a.replaySession(); break;
  //     case "f":                   a.cycleFilter(); break;
  //     case "/":                   a.focusSearch(); break;
  //     case " ":                   a.toggleSelection(); break;
  //     case "R":                   if (a.isErrorState) a.retryFetch(); break;
  //     case "q":                   a.popScreen(); break;
  //     case "Escape":              a.popScreen(); break;
  //     default:
  //       if (modifiers.ctrl && key === "d") a.pageDown();
  //       if (modifiers.ctrl && key === "u") a.pageUp();
  //   }
  // });
}
```

**Esc priority chain implementation detail:**

1. Delete overlay open → `cancelDelete()` (dismiss overlay)
2. Search input focused → `clearSearch()` (clear query, unfocus input)
3. No overlay, no search → `popScreen()` (navigate back)

This is implemented as a waterfall in the `useKeyboard` handler, not as three separate bindings.

---

### Step 6: Presentational Components

All components receive data via props. None call hooks for data fetching. All use OpenTUI JSX primitives (`<box>`, `<text>`, `<input>`, `<scrollbox>`).

#### 6.1 `apps/tui/src/screens/Agents/components/SessionRow.tsx`

Renders a single session row. Purely presentational.

```typescript
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

  // Production render with theme colors:
  // const theme = useTheme();
  // return (
  //   <box flexDirection="row" width="100%" reverse={focused}>
  //     <text fg={theme[iconConfig.color]} bold={iconConfig.bold} width={2}>{icon}</text>
  //     {idPrefix && <text fg={theme.muted} width={10}>{idPrefix}</text>}
  //     <text bold={isActive} fg={titleInfo.isMuted ? theme.muted : undefined}
  //       italic={titleInfo.isItalic} width={titleCol?.width}>{titleInfo.text}</text>
  //     {msgCount && <text fg={theme.muted} width={8}>{msgCount}</text>}
  //     {duration && <text fg={theme.muted} width={8}>{duration}</text>}
  //     {timestamp && <text fg={theme.muted}>{timestamp}</text>}
  //   </box>
  // );

  // Interim render (before ThemeProvider ships):
  return (
    <box flexDirection="row" width="100%">
      <text>{icon} {titleInfo.text}</text>
    </box>
  );
}
```

**Rendering rules:**
- `focused === true` → `reverse` attribute on `<box>` (reverse video in primary accent)
- `session.status === "active"` → `bold` on title text
- `titleInfo.isMuted` → muted color (gray 245) for "Untitled session"
- `titleInfo.isItalic` → italic attribute for "Untitled session"
- `selected === true` → selection marker prefix (future batch delete)

#### 6.2 `apps/tui/src/screens/Agents/components/SessionFilterToolbar.tsx`

```typescript
import React from "react";
import type { SessionStatusFilter } from "../types.js";
import { STATUS_FILTER_LABELS, STATUS_FILTER_CYCLE } from "../types.js";

interface SessionFilterToolbarProps {
  activeFilter: SessionStatusFilter;
  searchQuery: string;
  isSearchFocused: boolean;
  onSearchChange: (query: string) => void;
  onSearchFocus: () => void;
  onSearchBlur: () => void;
  terminalWidth: number;
}

export function SessionFilterToolbar(props: SessionFilterToolbarProps): React.ReactElement {
  // Production render:
  // const theme = useTheme();
  // const searchWidth = Math.min(120, Math.max(20, Math.floor(props.terminalWidth * 0.3)));
  //
  // return (
  //   <box flexDirection="row" width="100%">
  //     <box flexDirection="row">
  //       {STATUS_FILTER_CYCLE.map((f, i) => (
  //         <React.Fragment key={f}>
  //           {i > 0 && <text fg={theme.border}> │ </text>}
  //           <text fg={f === props.activeFilter ? theme.primary : theme.muted}>
  //             {STATUS_FILTER_LABELS[f]}
  //           </text>
  //         </React.Fragment>
  //       ))}
  //     </box>
  //     <box flexGrow={1} />
  //     <input
  //       value={props.searchQuery} onChange={props.onSearchChange}
  //       focused={props.isSearchFocused} onFocus={props.onSearchFocus}
  //       onBlur={props.onSearchBlur} placeholder="Search sessions…"
  //       maxLength={120} width={searchWidth}
  //     />
  //   </box>
  // );

  // Interim render:
  return (
    <box flexDirection="row" width="100%">
      <text>Filter: {STATUS_FILTER_LABELS[props.activeFilter]}</text>
    </box>
  );
}
```

**Layout:**
- Left: filter labels separated by `│` (box-drawing vertical). Active filter in `primary` color; others in `muted`.
- Right: `<input>` for search. Width is `min(120, max(20, 30% of terminal width))`. Placeholder: `"Search sessions…"`.
- `/` key focuses the input (handled by keybinding hook, not by this component).

#### 6.3 `apps/tui/src/screens/Agents/components/DeleteConfirmationOverlay.tsx`

```typescript
import React from "react";
import type { AgentSession } from "@codeplane/ui-core";

interface DeleteConfirmationOverlayProps {
  session: AgentSession;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmationOverlay({
  session, onConfirm, onCancel,
}: DeleteConfirmationOverlayProps): React.ReactElement {
  const isActive = session.status === "active";
  const titlePreview = session.title
    ? session.title.slice(0, 40) + (session.title.length > 40 ? "…" : "")
    : "Untitled session";

  // Production render:
  // const theme = useTheme();
  // const { modalWidth } = useLayout();
  //
  // return (
  //   <box position="absolute" top="center" left="center" width={modalWidth}
  //     height={isActive ? 7 : 5} border="single"
  //     borderColor={isActive ? theme.warning : theme.border}
  //     flexDirection="column" padding={1}>
  //     <text bold>Delete agent session?</text>
  //     <text fg={theme.muted}>"{titlePreview}"</text>
  //     {isActive && (
  //       <text fg={theme.warning}>⚠ This session is still active. Delete anyway?</text>
  //     )}
  //     <box flexDirection="row" gap={2} marginTop={1}>
  //       <text>Enter: confirm</text>
  //       <text>Esc: cancel</text>
  //     </box>
  //   </box>
  // );

  // Interim render:
  return (
    <box position="absolute">
      <text>Delete "{titlePreview}"?</text>
    </box>
  );
}
```

**Overlay behavior:**
- Rendered as `position="absolute"`, centered
- Border color: `theme.warning` (yellow) for active sessions, `theme.border` (gray) for others
- Active sessions show additional warning line
- Focus trapped: only Enter (confirm) and Esc (cancel) handled; all other keys swallowed

#### 6.4 `apps/tui/src/screens/Agents/components/SessionEmptyState.tsx`

```typescript
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
      message = `No sessions match \"${searchQuery}\".`;
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
```

#### 6.5 Update `apps/tui/src/screens/Agents/components/index.ts`

Expand the barrel to export all session list components alongside existing chat components:

```typescript
export * from "./MessageBlock.js";
export * from "./ToolBlock.js";
export * from "./SessionRow.js";
export * from "./SessionFilterToolbar.js";
export * from "./DeleteConfirmationOverlay.js";
export * from "./SessionEmptyState.js";
```

---

### Step 7: Main Screen Component

**File:** `apps/tui/src/screens/Agents/AgentSessionListScreen.tsx`

Orchestrates all subcomponents, hooks, and state. This is the single largest file (~245 lines). The reference implementation is complete and can be promoted directly.

**Component structure:**

1. **Data fetching:** `useAgentSessions(owner, repo, { perPage: 30 })` returns `sessions`, `totalCount`, `isLoading`, `error`, `hasMore`, `fetchMore`, `refetch`.

2. **Local state:**
   - `focusIndex: number` — index into `filteredSessions` (not raw `sessions`)
   - `selectedIds: Set<string>` — multi-select for future batch operations
   - `deleteTarget: AgentSession | null` — non-null when confirmation overlay is open
   - `flashMessage: string | null` — status bar flash text, auto-cleared after 3s

3. **Terminal dimensions:** Currently stubbed as `width=120, height=40`. Productionize by replacing with `useTerminalDimensions()` from `@opentui/react` and `useOnResize()` for synchronous re-layout.

4. **Breakpoint calculation:** `useMemo` derives `Breakpoint` from `width`/`height`.

5. **Column computation:** `useMemo(() => getSessionListColumns(breakpoint, width), [breakpoint, width])`.

6. **Filtering:** `useSessionFilter(sessions)` provides `filteredSessions`, `activeFilter`, search state, and `emptyReason`.

7. **Focus clamping:** `useEffect` clamps `focusIndex` to `[0, filteredSessions.length - 1]` when the filtered list shrinks.

8. **Delete hook:** `useDeleteAgentSession(owner, repo, callbacks)` with optimistic removal and error handling for 403 and 429.

9. **SSE:** `useSessionListSSE(repoId, onUpdate)` — stub until SSEProvider ships.

10. **Pagination:** `handleScrollNearEnd` calls `fetchMore()` when `hasMore && !isLoading && sessions.length < 500`.

11. **Navigation actions:**
    - `handleOpen` → `push("AgentChat", { owner, repo, sessionId })` (no-op during loading)
    - `handleCreate` → `push("agent-session-create", { owner, repo })` (suppressed for read-only with flash)
    - `handleReplay` → `push("AgentChat", { owner, repo, sessionId })` (only for completed/failed/timed_out; flash for active/pending)
    - `handleDelete` → sets `deleteTarget` (no-op if overlay already open)

12. **Render states:**
    - Error (no data): title + centered error message + "Press R to retry"
    - Loading (no data): title + toolbar + centered "Loading agent sessions…"
    - Main: title with count + flash message + toolbar + list or empty state + overlay

---

### Step 8: Screen Registration

When the router ships to production (via `tui-agent-screen-registry` dependency), modify `apps/tui/src/router/registry.ts`:

```typescript
// Before:
[ScreenName.AgentSessionList]: {
  component: PlaceholderScreen,
  requiresRepo: false,
  requiresOrg: false,
  breadcrumbLabel: () => "Agent Sessions",
},

// After:
[ScreenName.AgentSessionList]: {
  component: AgentSessionListScreen,
  requiresRepo: false, // false in registry; owner/repo passed via params
  requiresOrg: false,
  breadcrumbLabel: () => "Agent Sessions",
},
```

Add the import:
```typescript
import { AgentSessionListScreen } from "../screens/Agents/AgentSessionListScreen.js";
```

Also create `apps/tui/src/screens/Agents/index.ts`:
```typescript
export { AgentSessionListScreen } from "./AgentSessionListScreen.js";
```

**Command palette entry** (when command registry ships):
```typescript
{
  label: "Agent Sessions",
  alias: ":agents",
  keybindingHint: "g a",
  requiresRepo: true,
  action: () => navigation.push(ScreenName.AgentSessionList, { owner, repo }),
}
```

**Deep-link support:** When `--screen agents --repo owner/repo` is passed, the bootstrap sequence pre-populates the navigation stack:
```typescript
[
  { screen: "Dashboard" },
  { screen: "RepoOverview", params: { owner, repo } },
  { screen: "AgentSessionList", params: { owner, repo } },
]
```

---

### Step 9: Telemetry, Observability, and Permissions

#### Telemetry

15 events from the product spec. All are no-ops until the telemetry provider ships. Integration points in `AgentSessionListScreen`:

| Event | Trigger Point |
|-------|---------------|
| `tui.agents.session_list.view` | `useEffect` on mount (once) |
| `tui.agents.session_list.navigate_to_chat` | `handleOpen` callback |
| `tui.agents.session_list.navigate_to_replay` | `handleReplay` callback |
| `tui.agents.session_list.create_initiated` | `handleCreate` callback |
| `tui.agents.session_list.delete_initiated` | `handleDelete` callback |
| `tui.agents.session_list.delete_confirmed` | `handleDeleteConfirm` callback |
| `tui.agents.session_list.delete_cancelled` | `handleDeleteCancel` callback |
| `tui.agents.session_list.filter_change` | `cycleFilter` wrapper |
| `tui.agents.session_list.search` | Debounced (300ms) on `searchQuery` change |
| `tui.agents.session_list.paginate` | `handleScrollNearEnd` callback |
| `tui.agents.session_list.sse_status_update` | SSE callback |
| `tui.agents.session_list.error` | Error handler in data fetch |
| `tui.agents.session_list.retry` | `retryFetch` callback |
| `tui.agents.session_list.empty` | When `emptyReason !== "none"` |
| `tui.agents.session_list.no_repo_context` | Mount without repo params |

#### Logging

Structured logging to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`). Format: `AgentSessions: {event} [{key}={value}]`.

#### Permissions

- **Read access** required to view the session list (403 → inline error)
- **Write access** required to create sessions (`n` key suppressed with flash)
- **Ownership or admin** required to delete sessions (`d` key suppressed for non-owner non-admin; 403 on delete reverts optimistic update)
- Permission checks stubbed until `useAuth()` from AuthProvider ships

---

## 5. Data Flow Diagram

```
┌─────────────────┐     GET /api/repos/:o/:r/agent/sessions?page=N&per_page=30
│  useAgentSessions│────────────────────────────────────────────────────────────►
│  (ui-core hook)  │◄─────────────────── { sessions[], X-Total-Count header }  │
└────────┬────────┘                                                            │
         │ sessions[]                                                  API Server
         ▼                                                                     │
┌─────────────────┐                                                            │
│ useSessionFilter│  client-side filter (status) + search (title substring)     │
│                 │  → filteredSessions[]                                       │
└────────┬────────┘                                                            │
         │ filteredSessions[]                                                  │
         ▼                                                                     │
┌─────────────────────────────────────────────┐                                │
│         AgentSessionListScreen              │  DELETE /api/repos/:o/:r/agent/ │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐  │  sessions/:id                   │
│  │ Title    │ │ Filter   │ │ SessionRow │  │──────────────────────────────────►
│  │ Row      │ │ Toolbar  │ │ × N        │  │◄───────── 204 / 403 / 404       │
│  └──────────┘ └──────────┘ └────────────┘  │                                 │
│  ┌──────────────┐ ┌───────────────────┐    │  SSE: agent_session_{repoId}     │
│  │ Empty State   │ │ Delete Overlay   │    │◄─────────────────────────────────│
│  └──────────────┘ └───────────────────┘    │                                 │
└─────────────────────────────────────────────┘                                │
         │ push/pop                                                            │
         ▼                                                                     │
┌─────────────────┐                                                            │
│ NavigationProvider│  → AgentChatScreen / AgentSessionCreate / Replay          │
└─────────────────┘                                                            │
```

---

## 6. API Contract Summary

### `GET /api/repos/:owner/:repo/agent/sessions`

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `page` | query int | 1 | Page number |
| `per_page` | query int | 30 | Max 50 (client-capped) |

**Response:** `200 OK` with JSON array of `AgentSession` objects.
**Header:** `X-Total-Count: <integer>` — total sessions across all pages.
**Error codes:** 401 (auth), 403 (permission), 429 (rate limit: 300 req/min), 500 (server error).

### `DELETE /api/repos/:owner/:repo/agent/sessions/:id`

**Response:** `204 No Content` on success.
**Error codes:** 401 (auth), 403 (not owner/admin), 404 (already deleted), 429 (rate limit: 60 req/min).

### `AgentSession` shape

```typescript
interface AgentSession {
  id: string;              // UUID
  repositoryId: string;
  userId: string;
  workflowRunId: string | null;
  title: string;           // max 255 characters
  status: "active" | "completed" | "failed" | "timed_out" | "pending";
  startedAt: string | null;   // ISO-8601
  finishedAt: string | null;  // ISO-8601
  createdAt: string;          // ISO-8601
  updatedAt: string;          // ISO-8601
  messageCount?: number;      // present when using list endpoint
}
```

---

## 7. Error Handling Matrix

| Error | Detection | User Behavior | Recovery |
|-------|-----------|---------------|----------|
| 401 auth expired | API response | Auth error screen pushed | `codeplane auth login` |
| 403 permission denied | API response | Inline error message | Navigate away |
| 429 rate limited | API response | Status bar flash with retry-after | Wait, press R |
| Network timeout (30s) | Fetch promise timeout | Loading → error with R retry | Press R |
| Server 500 | API response | Error state | Press R |
| Delete 404 | DELETE response | Optimistic stands, no flash | Correct — session gone |
| Delete 403 | DELETE response | Optimistic reverts, flash "Cannot delete: not your session" | Contact admin |
| Delete 429 | DELETE response | Optimistic reverts, flash with retry-after | Wait, retry |
| SSE disconnect | EventSource error | Status bar warning, stale data | Auto-reconnect (1s, 2s, 4s, 8s, max 30s) |
| SSE permanent fail | >10 reconnects | Persistent status bar warning | Leave and re-enter screen |
| No repo context | Screen mount check | Flash + redirect to repo list | Select a repo |
| Terminal too small | < 80×24 check | "Terminal too small" (handled by router) | Resize terminal |
| Component crash | Error boundary | "Press r to restart" | Restart TUI |

---

## 8. Productionization Checklist

Every stub has a stable type signature. Productionizing means replacing the body — never the interface.

| Stub | Current State | Productionize When | How |
|------|--------------|-------------------|-----|
| `useTerminalDimensions()` | Hardcoded `120×40` in screen | `tui-foundation-scaffold` ships | Replace constants with `const { width, height } = useTerminalDimensions()` from `@opentui/react` |
| `useOnResize()` | Not called | `tui-foundation-scaffold` ships | Add hook; columns recalc is automatic via `useMemo` deps on `width`/`height` |
| `useKeyboard()` | Commented-out handler in `useSessionListKeybindings` | `tui-foundation-scaffold` ships | Uncomment the `useKeyboard((key, modifiers) => { ... })` block |
| `useSessionListSSE()` | No-op body | `tui-sse-provider` ships | Implement via `useSSEChannel(channelName, handler)` — signature is stable |
| Navigation (`push`/`pop`) | `useNavigation()` already imported | `tui-agent-screen-registry` ships | Already wired. Push calls work via NavigationProvider |
| Status bar hints | Not rendered | `tui-app-shell` ships | Call `useStatusBarHints()` with `"j/k:nav Enter:open n:new d:del r:replay q:back"` |
| Breadcrumb | Not rendered | `tui-app-shell` ships | Automatic via screen registry entry `breadcrumbLabel: () => "Agent Sessions"` |
| Telemetry | No-op stubs | `tui-telemetry-provider` ships | Replace with `useTelemetry().trackEvent(name, props)` |
| Logger | Not imported | `tui-logger` ships | Import structured logger, add log calls per observability spec |
| Theme colors | Not applied | `tui-theme-provider` ships | Import `useTheme()`, apply `fg={theme.primary}` etc. |
| Auth / permissions | Not checked | `tui-auth-provider` ships | Use `useAuth()` for `hasWriteAccess` checks |
| Flash messages | Local state only | `tui-status-bar` ships | Integrate with status bar flash API |
| Unicode detection | Not checked | `tui-foundation-scaffold` ships | Use terminal capability query to set `useTextFallback` prop |
| Scroll-to-end pagination | Not wired | `<scrollbox>` scroll event ships | Wire `onScrollNearEnd` to `handleScrollNearEnd` |
| `reverse` attribute on focused row | Not applied | OpenTUI `<box reverse>` ships | Set `reverse={focused}` on row's outer `<box>` |

---

## 9. Unit & Integration Tests

### Test Infrastructure

**File:** `e2e/tui/agents.test.ts` — 121 test stubs in the `describe("TUI_AGENT_SESSION_LIST", ...)` block (lines 449–595 of the specs reference file). All have correct IDs and descriptions with empty bodies.

**File:** `e2e/tui/helpers.ts` — Complete with `launchTUI`, `navigateToAgents`, `waitForSessionListReady`, credential helpers, and the full `TUITestInstance` interface.

**Framework:** `@microsoft/tui-test` via Bun's built-in test runner (`bun:test`).

**Principles (per memory/feedback_failing_tests.md):**
- Tests run against a real API server with test fixtures, not mocks.
- Tests that fail due to unimplemented backends are left failing — never skipped or commented out.
- Each test validates one user-facing behavior.
- Tests are independent — each launches a fresh TUI instance.
- Snapshot tests use golden-file comparison with ANSI escape sequences preserved.

### Helper Functions (in `e2e/tui/helpers.ts`)

```typescript
export async function navigateToAgents(terminal: TUITestInstance): Promise<void> {
  await terminal.sendKeys("g", "a");
  await terminal.waitForText("Agent Sessions");
}

export async function waitForSessionListReady(terminal: TUITestInstance): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < 10_000) {
    const content = terminal.snapshot();
    if (!content.includes("Loading sessions") && (content.includes("sessions") || content.includes("No sessions"))) {
      return;
    }
    await sleep(100);
  }
}
```

### Test Catalog: Terminal Snapshot Tests (28 tests)

Each snapshot test launches a TUI at a specific terminal size, navigates to the Agent Session List, waits for data, and captures the full terminal buffer.

```typescript
// SNAP-AGENT-LIST-001: 120×40 standard layout
test("SNAP-AGENT-LIST-001: 120×40 with mixed status sessions — full layout", async () => {
  const terminal = await launchTUI({
    cols: 120, rows: 40,
    args: ["--screen", "agents", "--repo", "acme/api"],
  });
  await waitForSessionListReady(terminal);
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});

// SNAP-AGENT-LIST-002: 80×24 minimum
test("SNAP-AGENT-LIST-002: 80×24 minimum — icon, title, timestamp only", async () => {
  const terminal = await launchTUI({
    cols: 80, rows: 24,
    args: ["--screen", "agents", "--repo", "acme/api"],
  });
  await waitForSessionListReady(terminal);
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});

// SNAP-AGENT-LIST-003: 200×60 large
test("SNAP-AGENT-LIST-003: 200×60 large — all columns including ID prefix, duration", async () => {
  const terminal = await launchTUI({
    cols: 200, rows: 60,
    args: ["--screen", "agents", "--repo", "acme/api"],
  });
  await waitForSessionListReady(terminal);
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});
```

**Key snapshot assertions by test:**

| ID | Terminal Size | Key Assertion |
|----|--------------|---------------|
| 001 | 120×40 | Full layout with headers, icon + title + msg count + timestamp, focus highlight on first row |
| 002 | 80×24 | Status icon, title, timestamp only. Message count hidden |
| 003 | 200×60 | All columns: ID prefix (8ch+…), title (50ch), msg count, duration, timestamp (extended) |
| 004 | 120×40 | "No agent sessions yet. Press n to create one." centered |
| 005 | 120×40 | "No Active sessions. Press f to cycle filter." |
| 006 | 120×40 | "No Failed sessions. Press f to cycle filter." |
| 007 | 120×40 | `No sessions match "<query>".` |
| 008 | 120×40 | "Loading agent sessions…" with toolbar visible |
| 009 | 120×40 | Red error text + "Press R to retry" |
| 010 | 120×40 | Reverse video on active row, bold text |
| 011 | 120×40 | Reverse video on completed row, normal weight |
| 012 | 120×40 | All 5 icons: ● ✓ ✗ ⏱ ○ with correct colors |
| 013 | 120×40, TERM=dumb | Text fallbacks: [A] [C] [F] [T] [P] |
| 014 | 120×40 | Bold vs normal weight distinction |
| 015–017 | 120×40 | Filter toolbar with each filter highlighted |
| 018 | 120×40 | Search input focused with cursor |
| 019 | 120×40 | Narrowed list after search |
| 020 | 120×40 | "Loading more…" footer |
| 021 | 120×40 | "Showing 500 of N" footer |
| 022 | 120×40 | Breadcrumb path in header |
| 023 | 120×40 | Title row with count |
| 024 | 120×40 | Status bar hints |
| 025 | 120×40 | Title truncation with `…` |
| 026 | 120×40 | "Untitled session" in muted italic |
| 027 | 120×40 | Delete overlay centered with border |
| 028 | 120×40 | Delete overlay with "still active" warning |

### Test Catalog: Keyboard Interaction Tests (42 tests)

Each keyboard test launches a TUI, navigates to the session list, performs key sequences, and asserts on the resulting terminal state.

```typescript
// KEY-AGENT-LIST-001: j moves focus down
test("KEY-AGENT-LIST-001: j moves focus down one row", async () => {
  const terminal = await launchTUI({
    cols: 120, rows: 40,
    args: ["--screen", "agents", "--repo", "acme/api"],
  });
  await waitForSessionListReady(terminal);
  const beforeSnap = terminal.snapshot();
  await terminal.sendKeys("j");
  const afterSnap = terminal.snapshot();
  expect(beforeSnap).not.toEqual(afterSnap);
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});

// KEY-AGENT-LIST-005: j at bottom stops
test("KEY-AGENT-LIST-005: j at bottom stops at last row (no wrap)", async () => {
  const terminal = await launchTUI({
    cols: 120, rows: 40,
    args: ["--screen", "agents", "--repo", "acme/api"],
  });
  await waitForSessionListReady(terminal);
  await terminal.sendKeys("G"); // jump to last
  const atBottom = terminal.snapshot();
  await terminal.sendKeys("j"); // try to go past
  expect(terminal.snapshot()).toEqual(atBottom);
  await terminal.terminate();
});

// KEY-AGENT-LIST-036: Keys don't trigger in search mode
test("KEY-AGENT-LIST-036: j/k/n/d/r/f don't trigger while search focused", async () => {
  const terminal = await launchTUI({
    cols: 120, rows: 40,
    args: ["--screen", "agents", "--repo", "acme/api"],
  });
  await waitForSessionListReady(terminal);
  await terminal.sendKeys("/");
  await terminal.sendText("jkndr");
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});

// KEY-AGENT-LIST-039: Rapid j presses
test("KEY-AGENT-LIST-039: Rapid j×15 — each moves one row", async () => {
  const terminal = await launchTUI({
    cols: 120, rows: 40,
    args: ["--screen", "agents", "--repo", "acme/api"],
  });
  await waitForSessionListReady(terminal);
  for (let i = 0; i < 15; i++) {
    await terminal.sendKeys("j");
  }
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});

// KEY-AGENT-LIST-041: Esc priority chain
test("KEY-AGENT-LIST-041: Esc priority: overlay → search → pop", async () => {
  const terminal = await launchTUI({
    cols: 120, rows: 40,
    args: ["--screen", "agents", "--repo", "acme/api"],
  });
  await waitForSessionListReady(terminal);

  // Open delete overlay
  await terminal.sendKeys("d");
  await terminal.waitForText("Delete");
  // Esc should close overlay, NOT pop screen
  await terminal.sendKeys("Escape");
  await terminal.waitForNoText("Delete");
  await terminal.waitForText("Agent Sessions");

  // Start search
  await terminal.sendKeys("/");
  await terminal.sendText("test");
  // Esc should clear search, NOT pop screen
  await terminal.sendKeys("Escape");

  // Esc with nothing active should pop screen
  await terminal.sendKeys("Escape");
  await terminal.waitForNoText("Agent Sessions");

  await terminal.terminate();
});
```

### Test Catalog: Responsive Tests (14 tests)

```typescript
// RESP-AGENT-LIST-011: Resize from 120→80
test("RESP-AGENT-LIST-011: Resize 120→80 — columns collapse, focus preserved", async () => {
  const terminal = await launchTUI({
    cols: 120, rows: 40,
    args: ["--screen", "agents", "--repo", "acme/api"],
  });
  await waitForSessionListReady(terminal);
  await terminal.sendKeys("j", "j"); // Move focus to row 2
  await terminal.resize(80, 24);
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});
```

### Test Catalog: Integration Tests (22 tests)

```typescript
// INT-AGENT-LIST-001: Auth expiry
test("INT-AGENT-LIST-001: 401 during fetch → auth error screen", async () => {
  const terminal = await launchTUI({
    cols: 120, rows: 40,
    args: ["--screen", "agents", "--repo", "acme/api"],
    env: { CODEPLANE_TOKEN: "expired-token" },
  });
  await terminal.waitForText("codeplane auth login");
  await terminal.terminate();
});

// INT-AGENT-LIST-007: Navigate to chat and back preserves state
test("INT-AGENT-LIST-007: Navigate to chat and back preserves state", async () => {
  const terminal = await launchTUI({
    cols: 120, rows: 40,
    args: ["--screen", "agents", "--repo", "acme/api"],
  });
  await waitForSessionListReady(terminal);
  await terminal.sendKeys("j", "j"); // Focus row 2
  await terminal.sendKeys("f"); // Set filter to Active
  await terminal.sendKeys("Enter"); // Navigate to chat
  await waitForChatReady(terminal);
  await terminal.sendKeys("q"); // Pop back to list
  await terminal.waitForText("Agent Sessions");
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});

// INT-AGENT-LIST-015: g a go-to navigates
test("INT-AGENT-LIST-015: g a go-to navigates", async () => {
  const terminal = await launchTUI({
    cols: 120, rows: 40,
    args: ["--repo", "acme/api"],
  });
  await terminal.waitForText("Dashboard");
  await terminal.sendKeys("g", "a");
  await terminal.waitForText("Agent Sessions");
  await terminal.terminate();
});

// INT-AGENT-LIST-016: g a without repo context
test("INT-AGENT-LIST-016: g a without repo context → redirect with flash", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  await terminal.waitForText("Dashboard");
  await terminal.sendKeys("g", "a");
  await terminal.waitForText("Repositories");
  await terminal.terminate();
});
```

### Test Catalog: Edge Case Tests (15 tests)

```typescript
// EDGE-AGENT-LIST-003: Unicode/emoji in title
test("EDGE-AGENT-LIST-003: Unicode/emoji in title → grapheme-aware truncation", async () => {
  const terminal = await launchTUI({
    cols: 120, rows: 40,
    args: ["--screen", "agents", "--repo", "acme/api"],
  });
  await waitForSessionListReady(terminal);
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});

// EDGE-AGENT-LIST-006: Search with regex special chars
test("EDGE-AGENT-LIST-006: Search with regex special chars → literal match", async () => {
  const terminal = await launchTUI({
    cols: 120, rows: 40,
    args: ["--screen", "agents", "--repo", "acme/api"],
  });
  await waitForSessionListReady(terminal);
  await terminal.sendKeys("/");
  await terminal.sendText("test.*pattern");
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});

// EDGE-AGENT-LIST-014: Delete last session
test("EDGE-AGENT-LIST-014: Delete last session → empty state, focus reset", async () => {
  const terminal = await launchTUI({
    cols: 120, rows: 40,
    args: ["--screen", "agents", "--repo", "acme/api"],
  });
  await waitForSessionListReady(terminal);
  await terminal.sendKeys("d");
  await terminal.waitForText("Delete");
  await terminal.sendKeys("Enter");
  await terminal.waitForText("No agent sessions yet");
  await terminal.terminate();
});
```

### Test Implementation Notes

1. **All 121 test stubs already exist** in `specs/tui/e2e/tui/agents.test.ts` at lines 449–595. The work is to promote the file to `e2e/tui/agents.test.ts` and populate the empty test bodies with the patterns shown above.

2. **Test bodies that depend on unimplemented backends will fail.** Per project policy (and `memory/feedback_failing_tests.md`), these are left failing — never skipped, never commented out, never mocked.

3. **Snapshot golden files** will be created on first run via `toMatchSnapshot()`. They are stored in `e2e/tui/__snapshots__/agents.test.ts.snap`.

4. **Test data fixtures:** Tests assume a test API server with fixture data including:
   - A repo `acme/api` with 10+ agent sessions in mixed statuses
   - A repo with exactly 0 sessions (for empty state tests)
   - A repo with exactly 1 session (for delete-last tests)
   - Sessions with null titles, 255-char titles, unicode/emoji titles
   - Sessions with 0 messages, null startedAt/finishedAt

5. **Terminal environment:** Tests set `TERM=xterm-256color`, `COLORTERM=truecolor`, `LANG=en_US.UTF-8` by default. SNAP-AGENT-LIST-013 overrides with `TERM=dumb` for text fallback testing.

6. **Each test is independent:** Fresh `launchTUI()` call per test, fresh process, fresh state. No shared state between tests.

---

## 10. Responsive Layout Reference

| Breakpoint | Icon | ID Prefix | Title | Msg Count | Duration | Timestamp | Toolbar |
|-----------|------|-----------|-------|-----------|----------|-----------|--------|
| 80×24 min | 2ch | hidden | remaining−8ch | hidden | hidden | 4ch | filter + search |
| 120×40 std | 2ch | hidden | 40ch | 8ch | hidden | 4ch | full |
| 200×60 lg | 2ch | 10ch | 50ch | 8ch | 8ch | 6ch | full |

Resize triggers synchronous re-layout via `useOnResize()`. Focused row index preserved. Column widths recalculated. Search input width adjusts proportionally.

---

## 11. Dependencies and Ordering

This ticket depends on three upstream tickets:

1. **`tui-agent-data-hooks`** — Provides `useAgentSessions()` and `useDeleteAgentSession()` from `@codeplane/ui-core`. **Required before data flows.** Without this, the screen renders only the error/loading states.

2. **`tui-agent-screen-registry`** — Provides the screen registration pattern and go-to / command palette wiring. **Required before navigation works.** Without this, the screen exists as a component but can't be reached.

3. **`tui-agent-e2e-scaffolding`** — Provides test helpers (`navigateToAgents`, `waitForSessionListReady`) and fixture data. **Required before tests can run.** The helpers already exist in specs; this ticket promotes them.

Downstream tickets that depend on this one:
- `tui-agent-chat-screen` — Navigated to via Enter on a session row
- `tui-agent-session-create` — Navigated to via `n` key
- `tui-agent-session-replay` — Navigated to via `r` key

---

## 12. Promotion Workflow

All files follow the same promotion pattern: copy from `specs/tui/apps/tui/src/` to `apps/tui/src/`, then complete any stubs.

### Files to create by copying from specs

| Source (specs/tui/) | Destination (production) | Modifications |
|---------------------|--------------------------|---------------|
| `apps/tui/src/screens/Agents/AgentSessionListScreen.tsx` | `apps/tui/src/screens/Agents/AgentSessionListScreen.tsx` | None (promote as-is; stubs have stable interfaces) |
| `apps/tui/src/screens/Agents/components/SessionRow.tsx` | `apps/tui/src/screens/Agents/components/SessionRow.tsx` | None |
| `apps/tui/src/screens/Agents/components/SessionFilterToolbar.tsx` | `apps/tui/src/screens/Agents/components/SessionFilterToolbar.tsx` | None |
| `apps/tui/src/screens/Agents/components/DeleteConfirmationOverlay.tsx` | `apps/tui/src/screens/Agents/components/DeleteConfirmationOverlay.tsx` | None |
| `apps/tui/src/screens/Agents/components/SessionEmptyState.tsx` | `apps/tui/src/screens/Agents/components/SessionEmptyState.tsx` | None |
| `apps/tui/src/screens/Agents/hooks/useSessionFilter.ts` | `apps/tui/src/screens/Agents/hooks/useSessionFilter.ts` | None |
| `apps/tui/src/screens/Agents/hooks/useSessionListKeybindings.ts` | `apps/tui/src/screens/Agents/hooks/useSessionListKeybindings.ts` | None |
| `apps/tui/src/screens/Agents/hooks/useSessionListSSE.ts` | `apps/tui/src/screens/Agents/hooks/useSessionListSSE.ts` | None |
| `apps/tui/src/screens/Agents/utils/sessionStatusIcon.ts` | `apps/tui/src/screens/Agents/utils/sessionStatusIcon.ts` | None |
| `apps/tui/src/screens/Agents/utils/sessionListColumns.ts` | `apps/tui/src/screens/Agents/utils/sessionListColumns.ts` | None |
| `apps/tui/src/screens/Agents/utils/formatDuration.ts` | `apps/tui/src/screens/Agents/utils/formatDuration.ts` | None |
| `apps/tui/src/screens/Agents/utils/formatMessageCount.ts` | `apps/tui/src/screens/Agents/utils/formatMessageCount.ts` | None |
| `apps/tui/src/screens/Agents/utils/formatTotalCount.ts` | `apps/tui/src/screens/Agents/utils/formatTotalCount.ts` | None |
| `apps/tui/src/screens/Agents/utils/truncateTitle.ts` | `apps/tui/src/screens/Agents/utils/truncateTitle.ts` | None |
| `apps/tui/src/screens/Agents/index.ts` | `apps/tui/src/screens/Agents/index.ts` | None |

### Files to modify in production

| File | Change |
|------|--------|
| `apps/tui/src/screens/Agents/types.ts` | Add `SessionStatusFilter`, `STATUS_FILTER_CYCLE`, `STATUS_FILTER_LABELS`, `StatusIconConfig`, `SessionListColumn` after existing message types |
| `apps/tui/src/screens/Agents/components/index.ts` | Add re-exports for `SessionRow`, `SessionFilterToolbar`, `DeleteConfirmationOverlay`, `SessionEmptyState` |

### Test files to promote

| Source (specs/tui/) | Destination | Modifications |
|---------------------|-------------|---------------|
| `e2e/tui/agents.test.ts` | `e2e/tui/agents.test.ts` | Populate test bodies with patterns from Section 9 |
| `e2e/tui/helpers.ts` | `e2e/tui/helpers.ts` | Promote as-is (complete) |

### Verification

After promotion:
1. `bun typecheck` passes on all new files
2. `bun test e2e/tui/agents.test.ts` runs all 121 tests (most will fail due to unimplemented backends — this is expected and correct)
3. No runtime imports are broken
4. The `formatTimestamp.ts` in production is preserved (it uses superior relative time math vs the specs version's `toLocaleString`)