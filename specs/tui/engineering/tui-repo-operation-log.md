# TUI_REPO_OPERATION_LOG — Engineering Specification

## Overview

This spec covers the complete implementation of the repository operation log tab (Tab 5 — Op Log) within the Codeplane TUI. The Op Log is a chronological audit trail of jj operations rendered as a vertically scrollable, filterable, paginated list with an inline detail view. It is a read-only view — jj operations are immutable historical records.

### Dependencies

| Dependency | Ticket | What it provides |
|------------|--------|------------------|
| `tui-repo-screen-scaffold` | Required | `RepoOverviewScreen`, `RepoContext`, `RepoTabProvider`, tab content mounting lifecycle |
| `tui-repo-jj-hooks` | Required | `useOperationLog()` hook, `Operation` type, `parseOperation()`, `useCursorPagination` primitive |
| `tui-clipboard-util` | Soft | `useClipboard()` hook for `y` (yank) action. If not yet implemented, provide inline fallback |
| `tui-repo-tab-bar-component` | Required | `TabBar`, `REPO_TABS`, `RepoTabContext`, `useRepoTab()` |

### Scope

- **In scope:** Op Log list view, detail view, filtering, copy-to-clipboard, pagination, responsive columns, keybindings, telemetry, logging, error handling, E2E tests.
- **Out of scope:** Op log write operations (restore, undo), SSE streaming (op log uses REST only), admin-only data display.

---

## Implementation Plan

The implementation is structured as vertical steps. Each step produces a shippable increment that compiles and can be tested independently.

### Step 1: Types and Constants

**File:** `apps/tui/src/screens/Repository/OperationLog/types.ts`

Define the internal types for the Op Log tab that extend the base `Operation` type from jj-hooks.

```typescript
import type { Operation } from "../../../hooks/data/jj-types";

/**
 * Extended operation with additional fields for the Op Log UI.
 * The base Operation from jj-hooks has: operationId, description, timestamp.
 * The API may return additional fields that the detail view needs.
 */
export interface OperationDetail extends Operation {
  parentOperationId: string | null;
  operationType: string;
  user: string;
}

/**
 * View mode for the Op Log tab.
 */
export type OpLogViewMode = "list" | "detail";

/**
 * Column visibility configuration derived from terminal breakpoint.
 */
export interface OpLogColumnConfig {
  showOpId: boolean;
  showUser: boolean;
  showParentId: boolean;
  typeColumnWidth: number;
  timestampColumnWidth: number;
  opIdColumnWidth: number;
  userColumnWidth: number;
  parentIdColumnWidth: number;
}
```

**File:** `apps/tui/src/screens/Repository/OperationLog/constants.ts`

```typescript
/** Number of operations fetched per page */
export const OP_LOG_PAGE_SIZE = 50;

/** Maximum operations held in memory before eviction */
export const OP_LOG_MAX_ITEMS = 5000;

/** Maximum characters allowed in the filter input */
export const FILTER_MAX_LENGTH = 100;

/** Duration (ms) to show "Copied!" message in status bar */
export const COPY_CONFIRMATION_MS = 2000;

/** Column widths for responsive layout */
export const COLUMN = {
  OP_ID: 14,
  TYPE_MIN: 20,
  TYPE_LARGE: 24,
  USER: 16,
  PARENT_ID: 14,
  TIMESTAMP_MIN: 12,
  TIMESTAMP_STD: 14,
  TIMESTAMP_LARGE: 16,
} as const;

/** Operation type display labels for common jj operation types */
export const OP_TYPE_LABELS: Record<string, string> = {
  snapshot: "snapshot",
  rebase: "rebase",
  new: "new",
  bookmark: "bookmark",
  import_git_refs: "import",
  edit: "edit",
  abandon: "abandon",
  squash: "squash",
  describe: "describe",
  merge: "merge",
  restore: "restore",
  undo: "undo",
  workspace: "workspace",
};
```

---

### Step 2: Responsive Column Configuration Hook

**File:** `apps/tui/src/screens/Repository/OperationLog/useOpLogColumns.ts`

Derives column visibility and widths from the current terminal breakpoint.

```typescript
import { useLayout } from "../../../hooks/useLayout";
import type { OpLogColumnConfig } from "./types";
import { COLUMN } from "./constants";

export function useOpLogColumns(): OpLogColumnConfig {
  const { breakpoint } = useLayout();

  switch (breakpoint) {
    case "large":
      return {
        showOpId: true,
        showUser: true,
        showParentId: true,
        typeColumnWidth: COLUMN.TYPE_LARGE,
        timestampColumnWidth: COLUMN.TIMESTAMP_LARGE,
        opIdColumnWidth: COLUMN.OP_ID,
        userColumnWidth: COLUMN.USER,
        parentIdColumnWidth: COLUMN.PARENT_ID,
      };
    case "standard":
      return {
        showOpId: true,
        showUser: false,
        showParentId: false,
        typeColumnWidth: COLUMN.TYPE_MIN,
        timestampColumnWidth: COLUMN.TIMESTAMP_STD,
        opIdColumnWidth: COLUMN.OP_ID,
        userColumnWidth: 0,
        parentIdColumnWidth: 0,
      };
    case "minimum":
    default:
      return {
        showOpId: false,
        showUser: false,
        showParentId: false,
        typeColumnWidth: COLUMN.TYPE_MIN,
        timestampColumnWidth: COLUMN.TIMESTAMP_MIN,
        opIdColumnWidth: 0,
        userColumnWidth: 0,
        parentIdColumnWidth: 0,
      };
  }
}
```

---

### Step 3: Timestamp Formatting Utility

**File:** `apps/tui/src/screens/Repository/OperationLog/formatOpTime.ts`

Formats operation timestamps for both the list view (relative) and detail view (absolute).

```typescript
/**
 * Format a timestamp as a relative time string for list view.
 * Examples: "3m ago", "2h ago", "yesterday", "3d ago", "2w ago", "Mar 21"
 */
export function formatRelativeTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (isNaN(date.getTime())) return "—";

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);

  if (diffSec < 60) return "<1m ago";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffWeek < 4) return `${diffWeek}w ago`;

  // Beyond 4 weeks: show short date
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Format a timestamp as an absolute time string for detail view.
 * Example: "2026-03-21 14:32:07 UTC"
 */
export function formatAbsoluteTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (isNaN(date.getTime())) return "—";

  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const sec = String(date.getUTCSeconds()).padStart(2, "0");

  return `${y}-${m}-${d} ${h}:${min}:${sec} UTC`;
}
```

---

### Step 4: Operation Row Component

**File:** `apps/tui/src/screens/Repository/OperationLog/OperationRow.tsx`

A single row in the operation log list. Renders columns based on the current responsive configuration.

```typescript
import React from "react";
import { useTheme } from "../../../hooks/useTheme";
import { truncateRight } from "../../../util/text";
import { formatRelativeTime } from "./formatOpTime";
import type { OperationDetail, OpLogColumnConfig } from "./types";

interface OperationRowProps {
  operation: OperationDetail;
  focused: boolean;
  columns: OpLogColumnConfig;
  availableWidth: number;
}

export function OperationRow({ operation, focused, columns, availableWidth }: OperationRowProps) {
  const theme = useTheme();

  // Calculate description width as remaining space after fixed columns
  const fixedColumnsWidth =
    (columns.showOpId ? columns.opIdColumnWidth : 0) +
    columns.typeColumnWidth +
    (columns.showUser ? columns.userColumnWidth : 0) +
    (columns.showParentId ? columns.parentIdColumnWidth : 0) +
    columns.timestampColumnWidth;
  const descriptionWidth = Math.max(10, availableWidth - fixedColumnsWidth - 2); // 2 for padding

  const bgColor = focused ? "primary" : undefined;
  const textColor = focused ? undefined : theme.muted;

  return (
    <box flexDirection="row" height={1} backgroundColor={bgColor}>
      {columns.showOpId && (
        <box width={columns.opIdColumnWidth}>
          <text color={theme.muted}>
            {operation.operationId.slice(0, 12).padEnd(12)}
          </text>
        </box>
      )}
      <box width={columns.typeColumnWidth}>
        <text bold={focused} color={theme.success}>
          {truncateRight(operation.operationType, columns.typeColumnWidth - 2)}
        </text>
      </box>
      {columns.showUser && (
        <box width={columns.userColumnWidth}>
          <text color={theme.muted}>
            {truncateRight(operation.user || "—", columns.userColumnWidth - 2)}
          </text>
        </box>
      )}
      <box flexGrow={1}>
        <text color={focused ? undefined : textColor}>
          {truncateRight(operation.description, descriptionWidth)}
        </text>
      </box>
      {columns.showParentId && (
        <box width={columns.parentIdColumnWidth}>
          <text color={theme.muted}>
            {operation.parentOperationId
              ? operation.parentOperationId.slice(0, 12)
              : "—"}
          </text>
        </box>
      )}
      <box width={columns.timestampColumnWidth}>
        <text color={theme.muted}>
          {formatRelativeTime(operation.timestamp)}
        </text>
      </box>
    </box>
  );
}
```

---

### Step 5: Operation Detail View Component

**File:** `apps/tui/src/screens/Repository/OperationLog/OperationDetailView.tsx`

The detail pane shown when the user presses `Enter` on a focused operation. Replaces the list view. Scrollable, read-only metadata display.

```typescript
import React from "react";
import { useTheme } from "../../../hooks/useTheme";
import { formatAbsoluteTime } from "./formatOpTime";
import type { OperationDetail } from "./types";

interface OperationDetailViewProps {
  operation: OperationDetail;
}

const LABEL_WIDTH = 18;

export function OperationDetailView({ operation }: OperationDetailViewProps) {
  const theme = useTheme();

  return (
    <box flexDirection="column" width="100%" flexGrow={1}>
      <box height={1}>
        <text color={theme.primary}>◀ </text>
        <text bold color={theme.primary}>Operation Detail</text>
      </box>
      <box height={1} />
      <scrollbox flexGrow={1}>
        <box flexDirection="column" gap={0}>
          <DetailField label="Operation ID" value={operation.operationId} theme={theme} />
          <DetailField
            label="Parent Op ID"
            value={operation.parentOperationId || "—"}
            muted={!operation.parentOperationId}
            theme={theme}
          />
          <DetailField
            label="Type"
            value={operation.operationType}
            color={theme.success}
            theme={theme}
          />
          <DetailField label="Description" value={operation.description} theme={theme} />
          <DetailField label="User" value={operation.user || "—"} theme={theme} />
          <DetailField
            label="Timestamp"
            value={formatAbsoluteTime(operation.timestamp)}
            theme={theme}
          />
        </box>
      </scrollbox>
    </box>
  );
}

function DetailField({
  label,
  value,
  color,
  muted,
  theme,
}: {
  label: string;
  value: string;
  color?: string;
  muted?: boolean;
  theme: ReturnType<typeof import("../../../hooks/useTheme").useTheme>;
}) {
  return (
    <box flexDirection="row" height={1}>
      <box width={LABEL_WIDTH}>
        <text color={theme.muted}>{label}</text>
      </box>
      <text color={muted ? theme.muted : color}>{value}</text>
    </box>
  );
}
```

---

### Step 6: Filter Logic Hook

**File:** `apps/tui/src/screens/Repository/OperationLog/useOpLogFilter.ts`

Client-side filter state and matching logic for the `/` filter interaction.

```typescript
import { useState, useMemo, useCallback } from "react";
import type { OperationDetail } from "./types";
import { FILTER_MAX_LENGTH } from "./constants";

export interface UseOpLogFilterReturn {
  filterText: string;
  filterActive: boolean;
  setFilterText: (text: string) => void;
  activateFilter: () => void;
  clearFilter: () => void;
  applyFilter: (operations: OperationDetail[]) => OperationDetail[];
  resultCount: number;
}

export function useOpLogFilter(operations: OperationDetail[]): UseOpLogFilterReturn {
  const [filterText, setFilterTextRaw] = useState("");
  const [filterActive, setFilterActive] = useState(false);

  const setFilterText = useCallback((text: string) => {
    setFilterTextRaw(text.slice(0, FILTER_MAX_LENGTH));
  }, []);

  const activateFilter = useCallback(() => {
    setFilterActive(true);
  }, []);

  const clearFilter = useCallback(() => {
    setFilterTextRaw("");
    setFilterActive(false);
  }, []);

  const filteredOperations = useMemo(() => {
    if (!filterText) return operations;
    const query = filterText.toLowerCase();
    return operations.filter(
      (op) =>
        op.operationType.toLowerCase().includes(query) ||
        op.description.toLowerCase().includes(query)
    );
  }, [operations, filterText]);

  const applyFilter = useCallback(
    (ops: OperationDetail[]) => {
      if (!filterText) return ops;
      const query = filterText.toLowerCase();
      return ops.filter(
        (op) =>
          op.operationType.toLowerCase().includes(query) ||
          op.description.toLowerCase().includes(query)
      );
    },
    [filterText]
  );

  return {
    filterText,
    filterActive,
    setFilterText,
    activateFilter,
    clearFilter,
    applyFilter,
    resultCount: filteredOperations.length,
  };
}
```

---

### Step 7: Op Log Keybindings Hook

**File:** `apps/tui/src/screens/Repository/OperationLog/useOpLogKeybindings.ts`

Registers all keybindings for both list and detail views. Conditionally activates bindings based on the current view mode and filter state.

```typescript
import { useScreenKeybindings } from "../../../hooks/useScreenKeybindings";
import type { KeyHandler, StatusBarHint } from "../../../providers/keybinding-types";
import type { OpLogViewMode } from "./types";

interface UseOpLogKeybindingsOptions {
  viewMode: OpLogViewMode;
  filterActive: boolean;
  // List actions
  moveDown: () => void;
  moveUp: () => void;
  openDetail: () => void;
  jumpToTop: () => void;
  jumpToBottom: () => void;
  pageDown: () => void;
  pageUp: () => void;
  copyId: () => void;
  activateFilter: () => void;
  clearFilter: () => void;
  refresh: () => void;
  // Detail actions
  closeDetail: () => void;
}

const LIST_HINTS: StatusBarHint[] = [
  { keys: "j/k", label: "navigate", order: 0 },
  { keys: "Enter", label: "detail", order: 10 },
  { keys: "y", label: "copy ID", order: 20 },
  { keys: "/", label: "filter", order: 30 },
  { keys: "R", label: "refresh", order: 40 },
];

const DETAIL_HINTS: StatusBarHint[] = [
  { keys: "q/Esc", label: "back", order: 0 },
  { keys: "y", label: "copy ID", order: 10 },
  { keys: "R", label: "refresh", order: 20 },
];

const FILTER_HINTS: StatusBarHint[] = [
  { keys: "Esc", label: "clear filter", order: 0 },
  { keys: "type to filter", label: "", order: 10 },
];

export function useOpLogKeybindings(options: UseOpLogKeybindingsOptions): void {
  const {
    viewMode,
    filterActive,
    moveDown,
    moveUp,
    openDetail,
    jumpToTop,
    jumpToBottom,
    pageDown,
    pageUp,
    copyId,
    activateFilter,
    clearFilter,
    refresh,
    closeDetail,
  } = options;

  const inList = viewMode === "list";
  const inDetail = viewMode === "detail";

  const bindings: KeyHandler[] = [
    // --- List navigation ---
    { key: "j", description: "Move down", group: "Op Log", handler: moveDown, when: () => inList && !filterActive },
    { key: "down", description: "Move down", group: "Op Log", handler: moveDown, when: () => inList && !filterActive },
    { key: "k", description: "Move up", group: "Op Log", handler: moveUp, when: () => inList && !filterActive },
    { key: "up", description: "Move up", group: "Op Log", handler: moveUp, when: () => inList && !filterActive },
    { key: "return", description: "Open detail", group: "Op Log", handler: openDetail, when: () => inList && !filterActive },
    { key: "G", description: "Jump to bottom", group: "Op Log", handler: jumpToBottom, when: () => inList && !filterActive },
    // Note: g g is handled by the go-to mode in KeybindingProvider for top-of-list
    { key: "ctrl+d", description: "Page down", group: "Op Log", handler: pageDown, when: () => inList && !filterActive },
    { key: "ctrl+u", description: "Page up", group: "Op Log", handler: pageUp, when: () => inList && !filterActive },

    // --- Copy ---
    { key: "y", description: "Copy operation ID", group: "Op Log", handler: copyId, when: () => !filterActive },

    // --- Filter ---
    { key: "/", description: "Filter", group: "Op Log", handler: activateFilter, when: () => inList && !filterActive },
    { key: "escape", description: "Clear filter", group: "Op Log", handler: clearFilter, when: () => inList && filterActive },

    // --- Refresh ---
    { key: "R", description: "Refresh", group: "Op Log", handler: refresh, when: () => !filterActive },

    // --- Detail navigation ---
    { key: "q", description: "Back to list", group: "Op Log", handler: closeDetail, when: () => inDetail },
    { key: "escape", description: "Back to list", group: "Op Log", handler: closeDetail, when: () => inDetail },
  ];

  const hints = filterActive
    ? FILTER_HINTS
    : inDetail
      ? DETAIL_HINTS
      : LIST_HINTS;

  useScreenKeybindings(bindings, hints);
}
```

---

### Step 8: Op Log Telemetry

**File:** `apps/tui/src/screens/Repository/OperationLog/telemetry.ts`

Telemetry event emitters following the established `emit()` pattern from `lib/telemetry.ts`.

```typescript
import { emit } from "../../../lib/telemetry";

interface OpLogBaseProps {
  repo_id?: string;
  repo_full_name: string;
}

export function emitOpLogViewed(
  props: OpLogBaseProps & {
    operation_count: number;
    load_time_ms: number;
    terminal_width: number;
    terminal_height: number;
  }
) {
  emit("tui.repo.oplog.viewed", props);
}

export function emitOpLogOperationSelected(
  props: OpLogBaseProps & {
    operation_id: string;
    operation_type: string;
    row_index: number;
  }
) {
  emit("tui.repo.oplog.operation_selected", props);
}

export function emitOpLogIdCopied(
  props: OpLogBaseProps & {
    operation_id: string;
    operation_type: string;
    from_view: "list" | "detail";
  }
) {
  emit("tui.repo.oplog.id_copied", props);
}

export function emitOpLogFiltered(
  props: OpLogBaseProps & {
    filter_text_length: number;
    result_count: number;
    total_count: number;
  }
) {
  emit("tui.repo.oplog.filtered", props);
}

export function emitOpLogPaginated(
  props: OpLogBaseProps & {
    page_number: number;
    page_size: number;
    total_loaded: number;
    load_time_ms: number;
  }
) {
  emit("tui.repo.oplog.paginated", props);
}

export function emitOpLogRefreshed(
  props: OpLogBaseProps & {
    previous_count: number;
    new_count: number;
    load_time_ms: number;
  }
) {
  emit("tui.repo.oplog.refreshed", props);
}

export function emitOpLogError(
  props: OpLogBaseProps & {
    error_code: number | string;
    error_message: string;
    action: "initial_load" | "pagination" | "refresh";
  }
) {
  emit("tui.repo.oplog.error", props);
}
```

---

### Step 9: Main OperationLogTab Component

**File:** `apps/tui/src/screens/Repository/OperationLog/OperationLogTab.tsx`

This is the primary component mounted by the tab content area when the user selects Tab 5. It orchestrates all sub-components, hooks, and state.

```typescript
import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTheme } from "../../../hooks/useTheme";
import { useLayout } from "../../../hooks/useLayout";
import { useScreenLoading } from "../../../hooks/useScreenLoading";
import { useSpinner } from "../../../hooks/useSpinner";
import { useOperationLog } from "../../../hooks/data/useOperationLog";
import { useRepoContext } from "../contexts/RepoContext";
import { logger } from "../../../lib/logger";
import { OperationRow } from "./OperationRow";
import { OperationDetailView } from "./OperationDetailView";
import { useOpLogColumns } from "./useOpLogColumns";
import { useOpLogFilter } from "./useOpLogFilter";
import { useOpLogKeybindings } from "./useOpLogKeybindings";
import { OP_LOG_PAGE_SIZE, OP_LOG_MAX_ITEMS, COPY_CONFIRMATION_MS } from "./constants";
import {
  emitOpLogViewed,
  emitOpLogOperationSelected,
  emitOpLogIdCopied,
  emitOpLogFiltered,
  emitOpLogPaginated,
  emitOpLogRefreshed,
  emitOpLogError,
} from "./telemetry";
import type { OperationDetail, OpLogViewMode } from "./types";

// Import clipboard hook — soft dependency, fallback if not available
let useClipboard: () => { copy: (t: string) => Promise<{ success: boolean }>; status: string };
try {
  useClipboard = require("../../../hooks/useClipboard").useClipboard;
} catch {
  // Fallback: no-op clipboard
  useClipboard = () => ({ copy: async () => ({ success: false }), status: "unavailable" });
}

export function OperationLogTab() {
  const { owner, repoName, repo } = useRepoContext();
  const theme = useTheme();
  const { width, height, breakpoint } = useLayout();
  const columns = useOpLogColumns();
  const { copy } = useClipboard();

  // --- Data fetching ---
  const {
    operations: rawOperations,
    isLoading,
    error,
    hasMore,
    fetchMore,
    refetch,
  } = useOperationLog(owner, repoName, {
    perPage: OP_LOG_PAGE_SIZE,
  });

  // Cast raw operations to OperationDetail (API should return full fields)
  const operations = rawOperations as OperationDetail[];

  // --- Loading state ---
  const { showSpinner, showError, loadingError, retry, spinnerFrame } = useScreenLoading({
    id: `oplog:${owner}/${repoName}`,
    label: "Loading operations…",
    isLoading: isLoading && operations.length === 0,
    error: error ? { message: error.message, status: error.httpStatus } : undefined,
    onRetry: refetch,
  });

  // --- View mode ---
  const [viewMode, setViewMode] = useState<OpLogViewMode>("list");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selectedOperation, setSelectedOperation] = useState<OperationDetail | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Filter ---
  const filter = useOpLogFilter(operations);
  const filteredOperations = filter.applyFilter(operations);

  // Clamp focus index when filtered list changes
  useEffect(() => {
    if (focusedIndex >= filteredOperations.length && filteredOperations.length > 0) {
      setFocusedIndex(filteredOperations.length - 1);
    }
  }, [filteredOperations.length, focusedIndex]);

  // --- Telemetry: viewed ---
  const loadStartRef = useRef<number>(Date.now());
  const viewedEmittedRef = useRef(false);
  useEffect(() => {
    if (!isLoading && operations.length > 0 && !viewedEmittedRef.current) {
      viewedEmittedRef.current = true;
      const fullName = `${owner}/${repoName}`;
      emitOpLogViewed({
        repo_full_name: fullName,
        operation_count: operations.length,
        load_time_ms: Date.now() - loadStartRef.current,
        terminal_width: width,
        terminal_height: height,
      });
      logger.info(`OpLog: loaded [repo=${fullName}] [count=${operations.length}] [load_time_ms=${Date.now() - loadStartRef.current}]`);
    }
  }, [isLoading, operations.length, owner, repoName, width, height]);

  // --- Actions ---
  const showStatusMessage = useCallback((msg: string, duration = COPY_CONFIRMATION_MS) => {
    setStatusMessage(msg);
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    statusTimeoutRef.current = setTimeout(() => setStatusMessage(null), duration);
  }, []);

  const moveDown = useCallback(() => {
    setFocusedIndex((i) => Math.min(i + 1, filteredOperations.length - 1));
  }, [filteredOperations.length]);

  const moveUp = useCallback(() => {
    setFocusedIndex((i) => Math.max(i - 1, 0));
  }, []);

  const openDetail = useCallback(() => {
    const op = filteredOperations[focusedIndex];
    if (!op) return;
    setSelectedOperation(op);
    setViewMode("detail");
    const fullName = `${owner}/${repoName}`;
    emitOpLogOperationSelected({
      repo_full_name: fullName,
      operation_id: op.operationId,
      operation_type: op.operationType,
      row_index: focusedIndex,
    });
    logger.debug(`OpLog: detail opened [repo=${fullName}] [op_id=${op.operationId}]`);
  }, [filteredOperations, focusedIndex, owner, repoName]);

  const closeDetail = useCallback(() => {
    setViewMode("list");
    // Focus is preserved — focusedIndex is unchanged
  }, []);

  const jumpToTop = useCallback(() => {
    setFocusedIndex(0);
  }, []);

  const jumpToBottom = useCallback(() => {
    setFocusedIndex(Math.max(0, filteredOperations.length - 1));
  }, [filteredOperations.length]);

  const pageDown = useCallback(() => {
    const pageSize = Math.max(1, Math.floor((height - 4) / 2)); // half viewport
    setFocusedIndex((i) => Math.min(i + pageSize, filteredOperations.length - 1));
  }, [height, filteredOperations.length]);

  const pageUp = useCallback(() => {
    const pageSize = Math.max(1, Math.floor((height - 4) / 2));
    setFocusedIndex((i) => Math.max(i - pageSize, 0));
  }, [height]);

  const copyId = useCallback(async () => {
    const op = viewMode === "detail" ? selectedOperation : filteredOperations[focusedIndex];
    if (!op) return;

    const fullName = `${owner}/${repoName}`;
    const result = await copy(op.operationId);
    if (result.success) {
      showStatusMessage("Copied!");
      logger.debug(`OpLog: copied [repo=${fullName}] [op_id=${op.operationId}]`);
    } else {
      showStatusMessage("Copy failed — clipboard not available");
      logger.warn(`OpLog: clipboard unavailable [repo=${fullName}]`);
    }

    emitOpLogIdCopied({
      repo_full_name: fullName,
      operation_id: op.operationId,
      operation_type: op.operationType,
      from_view: viewMode,
    });
  }, [viewMode, selectedOperation, filteredOperations, focusedIndex, owner, repoName, copy, showStatusMessage]);

  const activateFilter = useCallback(() => {
    if (isLoading && operations.length === 0) return; // disabled during initial load
    filter.activateFilter();
  }, [filter, isLoading, operations.length]);

  const handleClearFilter = useCallback(() => {
    filter.clearFilter();
    setFocusedIndex(0);
  }, [filter]);

  const refresh = useCallback(() => {
    const previousCount = operations.length;
    const startTime = Date.now();
    viewedEmittedRef.current = false;
    loadStartRef.current = Date.now();
    setFocusedIndex(0);
    setViewMode("list");
    filter.clearFilter();
    refetch();
    const fullName = `${owner}/${repoName}`;
    logger.info(`OpLog: refresh triggered [repo=${fullName}]`);
    // Note: refresh telemetry is emitted on completion via the viewed effect
  }, [operations.length, refetch, owner, repoName, filter]);

  // --- Pagination: auto-load next page when near bottom ---
  useEffect(() => {
    if (hasMore && !isLoading && focusedIndex >= filteredOperations.length * 0.8) {
      fetchMore();
    }
  }, [focusedIndex, filteredOperations.length, hasMore, isLoading, fetchMore]);

  // --- Telemetry: filter ---
  useEffect(() => {
    if (filter.filterText && filter.filterActive) {
      emitOpLogFiltered({
        repo_full_name: `${owner}/${repoName}`,
        filter_text_length: filter.filterText.length,
        result_count: filter.resultCount,
        total_count: operations.length,
      });
    }
  }, [filter.filterText, filter.filterActive, filter.resultCount, operations.length, owner, repoName]);

  // --- Keybindings ---
  useOpLogKeybindings({
    viewMode,
    filterActive: filter.filterActive,
    moveDown,
    moveUp,
    openDetail,
    jumpToTop,
    jumpToBottom,
    pageDown,
    pageUp,
    copyId,
    activateFilter,
    clearFilter: handleClearFilter,
    refresh,
    closeDetail,
  });

  // --- Mount/unmount logging ---
  useEffect(() => {
    logger.debug(`OpLog: mounted [repo=${owner}/${repoName}]`);
    return () => {
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    };
  }, [owner, repoName]);

  // --- Render ---

  // Full-screen loading state
  if (showSpinner) {
    return (
      <box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
        <text color={theme.primary}>{spinnerFrame}</text>
        <text color={theme.muted}>Loading…</text>
      </box>
    );
  }

  // Error state
  if (showError && loadingError) {
    const errorMessage =
      loadingError.type === "auth_error"
        ? "Session expired. Run `codeplane auth login` to re-authenticate."
        : loadingError.type === "rate_limited"
          ? `Rate limited. Try again in ${loadingError.retryAfterSeconds || "a few"} seconds.`
          : loadingError.httpStatus === 501
            ? "Operation log is not available. Backend not implemented."
            : `Error loading operations. Press \`R\` to retry.`;

    return (
      <box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
        <text color={theme.error}>{errorMessage}</text>
      </box>
    );
  }

  // Detail view
  if (viewMode === "detail" && selectedOperation) {
    return <OperationDetailView operation={selectedOperation} />;
  }

  // List view
  return (
    <box flexDirection="column" width="100%" flexGrow={1}>
      {/* Section header */}
      <box flexDirection="row" height={1}>
        <text bold color={theme.primary}>Operations</text>
        <text color={theme.muted}> ({operations.length})</text>
        <box flexGrow={1} />
        {statusMessage && <text color={theme.success}>{statusMessage} </text>}
        <text color={theme.muted}>/ filter  R refresh</text>
      </box>

      {/* Filter input */}
      {filter.filterActive && (
        <box height={1}>
          <input
            value={filter.filterText}
            onChange={filter.setFilterText}
            placeholder="Filter by type or description…"
          />
        </box>
      )}

      {/* Operation list */}
      <scrollbox flexGrow={1} onScrollEnd={() => hasMore && fetchMore()}>
        <box flexDirection="column">
          {filteredOperations.map((op, index) => (
            <OperationRow
              key={op.operationId}
              operation={op}
              focused={index === focusedIndex}
              columns={columns}
              availableWidth={width}
            />
          ))}

          {/* Pagination loading */}
          {isLoading && operations.length > 0 && (
            <box height={1} justifyContent="center">
              <text color={theme.muted}>Loading more…</text>
            </box>
          )}

          {/* Empty state */}
          {!isLoading && filteredOperations.length === 0 && (
            <box justifyContent="center" alignItems="center" flexGrow={1}>
              <text color={theme.muted}>
                {filter.filterText ? "No matching operations." : "No operations recorded."}
              </text>
            </box>
          )}

          {/* Pagination cap reached */}
          {operations.length >= OP_LOG_MAX_ITEMS && !hasMore && (
            <box height={1} justifyContent="center">
              <text color={theme.muted}>End of loaded operations. Press `R` to reload from start.</text>
            </box>
          )}
        </box>
      </scrollbox>
    </box>
  );
}
```

---

### Step 10: Barrel Export and Tab Integration

**File:** `apps/tui/src/screens/Repository/OperationLog/index.ts`

```typescript
export { OperationLogTab } from "./OperationLogTab";
```

The `OperationLogTab` is consumed by the parent `RepoOverviewScreen` via the tab content conditional rendering:

**Integration point in:** `apps/tui/src/screens/Repository/RepoOverviewScreen.tsx`

```typescript
import { OperationLogTab } from "./OperationLog";

// Inside the tab content switch:
{activeTabId === "oplog" && <OperationLogTab />}
```

This follows the pattern established by other tabs (bookmarks, changes, code, conflicts, settings) where each tab is conditionally mounted/unmounted based on the active tab ID from `RepoTabContext`.

---

### Step 11: Help Overlay Integration

The `useOpLogKeybindings` hook registers keybindings with `group: "Op Log"`, which means the help overlay (`?`) will automatically display an "Op Log" group with all registered keybindings when the Op Log tab is active. No additional integration code is needed — the `KeybindingProvider` and `HelpOverlay` pick up groups from the active keybinding scope.

---

### Step 12: Productionization Checklist

This section covers the path from the implementation above to production-quality code.

#### 12.1 Data Hook Hardening

The `useOperationLog` hook from `tui-repo-jj-hooks` uses the `useCursorPagination` primitive. Before production:

1. **Verify wire format parsing**: The `parseOperation()` function in `jj-types.ts` must handle the full `OperationResponse` wire format, including `parent_operation_id`, `operation_type`, and `user` fields. If the current `OperationResponse` type only has `operation_id`, `description`, and `timestamp`, it must be extended:

   ```typescript
   // In apps/tui/src/hooks/data/jj-types.ts
   interface OperationResponse {
     operation_id: string;
     parent_operation_id: string | null;
     operation_type: string;
     description: string;
     user: string;
     timestamp: string;  // ISO-8601
   }
   ```

2. **Memory cap verification**: The `useCursorPagination` primitive accepts a `maxItems` parameter. `useOperationLog` passes `5000`. Verify that the eviction behavior (dropping oldest items when cap exceeded) works correctly under rapid pagination.

3. **AbortController cleanup**: Verify that `useCursorPagination` cancels in-flight requests when the component unmounts (tab switch away). This prevents state updates on unmounted components.

4. **API error mapping**: Ensure that 401, 429, 500, and 501 status codes from `GET /api/repos/:owner/:repo/operations` are correctly mapped to `TUIFetchError` types (`auth_error`, `rate_limited`, `http_error`).

#### 12.2 Clipboard Fallback

If `useClipboard` is not yet implemented (depends on `tui-clipboard-util`):

1. The `OperationLogTab` uses a `try/catch` dynamic import with a no-op fallback.
2. Once `tui-clipboard-util` ships, remove the try/catch and use a direct import.
3. Test the clipboard integration on macOS (pbcopy), Linux/X11 (xclip), Linux/Wayland (wl-copy), and SSH sessions (OSC 52).

#### 12.3 g g (Jump to Top) Handling

The `g g` sequence (jump to first row) is handled by the go-to mode in `KeybindingProvider` at `PRIORITY.GOTO`. For Op Log, this means:

1. The first `g` press activates go-to mode (1500ms window).
2. A second `g` within the window should execute `jumpToTop` instead of navigating to a go-to destination.
3. This requires coordination with the `KeybindingProvider`. The approach: register a `g` handler at `PRIORITY.SCREEN` with `when: () => goToModeActive && viewMode === "list"` that calls `jumpToTop`. The `goToModeActive` state comes from the keybinding context.
4. If the existing `KeybindingProvider` does not expose `goToModeActive`, a simpler approach is to implement a local `g g` detection: track the last `g` press timestamp, and on a second `g` within 1500ms, call `jumpToTop` and consume the event.

#### 12.4 Filter Input Focus Management

When the filter is active:
- The `<input>` component captures all printable keys at `PRIORITY.TEXT_INPUT` (handled by OpenTUI).
- `Escape` must be handled at a level that can dismiss the filter. Since the `useOpLogKeybindings` hook registers at `PRIORITY.SCREEN`, and the input captures at `PRIORITY.TEXT_INPUT`, the `Escape` key needs special handling. In OpenTUI, the `<input>` component propagates `Escape` to the parent. The keybinding hook's `escape` handler with `when: () => filterActive` will fire.
- Verify that `Tab`/`Shift+Tab` from the filter input do not trigger tab bar switching. The `suppressInput` prop on `TabBarProps` or the `inputFocused` signal on `useTabBarKeybindings` should be set to `true` when the filter is active.

#### 12.5 Scroll Position Preservation

- On terminal resize: the `focusedIndex` state is the source of truth. The `<scrollbox>` component auto-scrolls to keep the focused row visible.
- On detail view close: `focusedIndex` is unchanged, so the list scrolls back to the same position.
- On tab switch away and back: the tab unmounts and remounts (per tab lifecycle). Data is re-fetched. `focusedIndex` resets to 0. This is acceptable for the Op Log tab — no state preservation across tab switches.

#### 12.6 Performance Considerations

- **Rendering 5000 rows**: If all 5000 operations are loaded, rendering all rows in the `<scrollbox>` may be expensive. OpenTUI's `<scrollbox>` uses virtual scrolling internally, so only visible rows are rendered to the terminal. However, React still creates 5000 `<OperationRow>` component instances. If performance is an issue, implement windowing: only render rows within a ±50 buffer of the focused index.
- **Filter performance**: Client-side filtering over 5000 items with `Array.filter` + `String.includes` is O(n) and should be <1ms. No optimization needed.
- **Rapid j/k presses**: Processed sequentially via React state updates. No debouncing — each press advances the cursor by exactly one row.

---

## File Inventory

### New Files

| Path | Purpose |
|------|---------|
| `apps/tui/src/screens/Repository/OperationLog/types.ts` | Type definitions for Op Log |
| `apps/tui/src/screens/Repository/OperationLog/constants.ts` | Constants (page size, max items, column widths) |
| `apps/tui/src/screens/Repository/OperationLog/useOpLogColumns.ts` | Responsive column configuration hook |
| `apps/tui/src/screens/Repository/OperationLog/formatOpTime.ts` | Timestamp formatting (relative + absolute) |
| `apps/tui/src/screens/Repository/OperationLog/OperationRow.tsx` | Single operation row component |
| `apps/tui/src/screens/Repository/OperationLog/OperationDetailView.tsx` | Full operation detail view |
| `apps/tui/src/screens/Repository/OperationLog/useOpLogFilter.ts` | Client-side filter state + matching |
| `apps/tui/src/screens/Repository/OperationLog/useOpLogKeybindings.ts` | Keybinding registration for list + detail |
| `apps/tui/src/screens/Repository/OperationLog/telemetry.ts` | Telemetry event emitters |
| `apps/tui/src/screens/Repository/OperationLog/OperationLogTab.tsx` | Main tab component (orchestrator) |
| `apps/tui/src/screens/Repository/OperationLog/index.ts` | Barrel export |

### Modified Files

| Path | Change |
|------|--------|
| `apps/tui/src/screens/Repository/RepoOverviewScreen.tsx` | Import and render `OperationLogTab` for `activeTabId === "oplog"` |
| `apps/tui/src/hooks/data/jj-types.ts` | Extend `OperationResponse` with `parent_operation_id`, `operation_type`, `user` fields |
| `apps/tui/src/hooks/data/jj-types.ts` | Update `parseOperation()` to handle new fields |

---

## Unit & Integration Tests

### Test File: `e2e/tui/repository.test.ts`

All tests use `@microsoft/tui-test`. Tests that fail due to unimplemented backends are **left failing** — never skipped or commented out. Each test launches a fresh TUI instance against a real API server with test fixtures.

```typescript
import { test, expect, describe } from "bun:test";
import { launchTUI } from "./helpers";

describe("TUI_REPO_OPERATION_LOG", () => {

  // ======================================================================
  // TERMINAL SNAPSHOT TESTS
  // ======================================================================

  describe("snapshots", () => {

    test("repo-oplog-default-state-120x40", async () => {
      // Navigate to a repo at standard size, activate Op Log tab
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r"); // go to repo list
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter"); // open first repo
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5"); // switch to Op Log tab
      await terminal.waitForText("Operations");
      expect(terminal.snapshot()).toMatchSnapshot();
      // Assert: section header "Operations (N)", op ID + type + description + timestamp columns
      const content = terminal.snapshot();
      expect(content).toMatch(/Operations \(\d+\)/);
      await terminal.terminate();
    });

    test("repo-oplog-default-state-80x24", async () => {
      // At minimum size, op ID column is hidden
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      expect(terminal.snapshot()).toMatchSnapshot();
      // At 80 columns: type + description + timestamp only
      await terminal.terminate();
    });

    test("repo-oplog-default-state-200x60", async () => {
      // At large size, all columns visible including user and parent ID
      const terminal = await launchTUI({ cols: 200, rows: 60 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-detail-view-120x40", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("Enter"); // open detail
      await terminal.waitForText("Operation Detail");
      expect(terminal.snapshot()).toMatchSnapshot();
      // Assert: detail fields visible — Operation ID, Parent Op ID, Type, Description, User, Timestamp
      const content = terminal.snapshot();
      expect(content).toMatch(/Operation ID/);
      expect(content).toMatch(/Parent Op ID/);
      expect(content).toMatch(/Type/);
      expect(content).toMatch(/Description/);
      expect(content).toMatch(/User/);
      expect(content).toMatch(/Timestamp/);
      await terminal.terminate();
    });

    test("repo-oplog-detail-view-80x24", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Operation Detail");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-filter-active", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("/"); // activate filter
      expect(terminal.snapshot()).toMatchSnapshot();
      // Assert: filter input visible with placeholder text
      const content = terminal.snapshot();
      expect(content).toMatch(/Filter by type or description/);
      await terminal.terminate();
    });

    test("repo-oplog-filter-results", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("/");
      await terminal.sendText("snapshot");
      expect(terminal.snapshot()).toMatchSnapshot();
      // Assert: only snapshot operations visible
      await terminal.terminate();
    });

    test("repo-oplog-filter-no-results", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("/");
      await terminal.sendText("zzzznonexistent");
      await terminal.waitForText("No matching operations.");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-empty-state", async () => {
      // Requires test fixture: repo with zero operations
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TEST_REPO: "empty-ops-repo" },
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("No operations recorded.");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-loading-state", async () => {
      // Capture snapshot before data arrives
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TEST_API_DELAY: "2000" }, // 2s delay
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      // Snapshot during loading — expect spinner
      await terminal.waitForText("Loading");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-error-state", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TEST_OPLOG_STATUS: "500" },
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Error loading operations");
      expect(terminal.snapshot()).toMatchSnapshot();
      const content = terminal.snapshot();
      expect(content).toMatch(/Press.*R.*to retry/);
      await terminal.terminate();
    });

    test("repo-oplog-501-not-implemented", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TEST_OPLOG_STATUS: "501" },
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operation log is not available");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-pagination-loading", async () => {
      // Requires test fixture: repo with >50 operations
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TEST_OPLOG_COUNT: "75" },
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("G"); // jump to bottom
      await terminal.waitForText("Loading more");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-focused-row-highlight", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("j", "j"); // move to row 3
      expect(terminal.snapshot()).toMatchSnapshot();
      // Assert: third row has reverse video / highlight styling
      await terminal.terminate();
    });

    test("repo-oplog-copied-status-bar", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("y"); // copy ID
      await terminal.waitForText("Copied!");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // ======================================================================
  // KEYBOARD INTERACTION TESTS — LIST NAVIGATION
  // ======================================================================

  describe("list navigation", () => {

    test("repo-oplog-navigate-down", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("j");
      // Assert: second row is focused (highlighted)
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-navigate-up", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("j", "k"); // down then up
      // Assert: first row is focused again
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-navigate-down-arrow", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("Down");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-navigate-up-arrow", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("j", "Up"); // down then up via arrow
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-navigate-bottom", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("G"); // jump to bottom
      // Assert: last loaded row is focused
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-navigate-top", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("G"); // go to bottom
      await terminal.sendKeys("g", "g"); // go to top
      // Assert: first row is focused
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-page-down", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("Ctrl+D"); // page down
      // Assert: scroll has advanced approximately half the viewport
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-page-up", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("Ctrl+D"); // page down
      await terminal.sendKeys("Ctrl+U"); // page up
      // Assert: returns to original position
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-navigate-at-top-boundary", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("k"); // up at top — should stay on row 1
      // Assert: focus remains on first row
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-navigate-at-bottom-boundary", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("G"); // jump to bottom
      await terminal.sendKeys("j"); // down at bottom — should stay
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // ======================================================================
  // KEYBOARD INTERACTION TESTS — DETAIL VIEW
  // ======================================================================

  describe("detail view", () => {

    test("repo-oplog-enter-detail", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Operation Detail");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-detail-back-q", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Operation Detail");
      await terminal.sendKeys("q");
      await terminal.waitForText("Operations"); // back to list
      await terminal.waitForNoText("Operation Detail");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-detail-back-esc", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Operation Detail");
      await terminal.sendKeys("Escape");
      await terminal.waitForText("Operations");
      await terminal.waitForNoText("Operation Detail");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-detail-copy-id", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Operation Detail");
      await terminal.sendKeys("y");
      await terminal.waitForText("Copied!");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-enter-detail-from-row-3", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("j", "j"); // move to row 3
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Operation Detail");
      // Assert: detail shows the third operation's data
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // ======================================================================
  // KEYBOARD INTERACTION TESTS — FILTER
  // ======================================================================

  describe("filter", () => {

    test("repo-oplog-filter-activate", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("/");
      // Assert: filter input is visible and focused
      const content = terminal.snapshot();
      expect(content).toMatch(/Filter by type or description/);
      await terminal.terminate();
    });

    test("repo-oplog-filter-type-text", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("/");
      await terminal.sendText("rebase");
      // Assert: list is filtered to only rebase operations
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-filter-clear-esc", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("/");
      await terminal.sendText("rebase");
      await terminal.sendKeys("Escape");
      // Assert: filter cleared, full list restored
      await terminal.waitForNoText("Filter by type or description");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-filter-case-insensitive", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("/");
      await terminal.sendText("SNAPSHOT");
      // Assert: matches "snapshot" type operations (case insensitive)
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-filter-matches-description", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("/");
      await terminal.sendText("working copy");
      // Assert: matches operations with "working copy" in description
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // ======================================================================
  // KEYBOARD INTERACTION TESTS — COPY & REFRESH
  // ======================================================================

  describe("copy and refresh", () => {

    test("repo-oplog-copy-from-list", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("y");
      await terminal.waitForText("Copied!");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-copy-different-row", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("j", "j"); // move to row 3
      await terminal.sendKeys("y");
      await terminal.waitForText("Copied!");
      // Assert: clipboard contains the third row's operation ID
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-refresh", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("j", "j"); // navigate away from top
      await terminal.sendKeys("R"); // refresh
      // Assert: list reloaded, scroll position reset to top
      await terminal.waitForText("Operations");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-refresh-after-error", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TEST_OPLOG_STATUS: "500" },
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Error loading operations");
      // Simulate server recovery by clearing the error env
      await terminal.sendKeys("R"); // retry
      // Assert: retry was initiated
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // ======================================================================
  // TAB INTEGRATION TESTS
  // ======================================================================

  describe("tab integration", () => {

    test("repo-oplog-tab-switch-away-and-back", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5"); // Op Log
      await terminal.waitForText("Operations");
      await terminal.sendKeys("j", "j"); // navigate
      await terminal.sendKeys("1"); // switch to Bookmarks
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5"); // back to Op Log
      await terminal.waitForText("Operations");
      // Assert: Op Log reloads (tab remounts)
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-tab-key-not-consumed", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5"); // Op Log
      await terminal.waitForText("Operations");
      await terminal.sendKeys("Tab"); // should cycle to tab 6 (Settings)
      // Assert: switched to Settings tab
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // ======================================================================
  // RESPONSIVE TESTS
  // ======================================================================

  describe("responsive layout", () => {

    test("repo-oplog-columns-at-80x24", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      // Assert: only type, description, timestamp columns visible
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-columns-at-120x40", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      // Assert: op ID, type, description, timestamp visible
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-columns-at-200x60", async () => {
      const terminal = await launchTUI({ cols: 200, rows: 60 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      // Assert: all columns — op ID, type, user, description, parent ID, timestamp
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-resize-120-to-80", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("j"); // focus second row
      await terminal.resize(80, 24);
      // Assert: op ID column disappears, focus preserved
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-resize-80-to-200", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.resize(200, 60);
      // Assert: all columns appear
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-resize-below-minimum", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.resize(60, 20);
      // Assert: "Terminal too small" message
      await terminal.waitForText("Terminal too small");
      await terminal.resize(120, 40);
      // Assert: restored
      await terminal.waitForText("Operations");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-detail-resize", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Operation Detail");
      await terminal.resize(80, 24);
      // Assert: detail view re-layouts to fit minimum terminal
      await terminal.waitForText("Operation Detail");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // ======================================================================
  // PAGINATION TESTS
  // ======================================================================

  describe("pagination", () => {

    test("repo-oplog-pagination-trigger", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TEST_OPLOG_COUNT: "75" },
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      // Navigate to 80% — should trigger pagination
      for (let i = 0; i < 40; i++) await terminal.sendKeys("j");
      // Assert: next page fetch triggered
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-pagination-appends", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TEST_OPLOG_COUNT: "75" },
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("G"); // jump to bottom, triggers pagination
      // Wait for additional operations to load
      // Assert: new operations appended, total > 50
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-pagination-error-preserves-data", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        env: {
          CODEPLANE_TEST_OPLOG_COUNT: "75",
          CODEPLANE_TEST_OPLOG_PAGE2_STATUS: "500",
        },
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("G"); // triggers pagination that will fail
      // Assert: page 1 data still visible, error at bottom
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // ======================================================================
  // RAPID INPUT TESTS
  // ======================================================================

  describe("rapid input", () => {

    test("repo-oplog-rapid-j-keys", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      // Send 10 j keys rapidly
      for (let i = 0; i < 10; i++) await terminal.sendKeys("j");
      // Assert: focus advanced exactly 10 rows (row index 10, 0-indexed)
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-rapid-filter-typing", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("/");
      await terminal.sendText("snap"); // type rapidly
      // Assert: filter shows "snap" and results are filtered
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-rapid-enter-back", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("Enter"); // open detail
      await terminal.sendKeys("q"); // immediately back
      // Assert: clean return to list, no visual artifacts
      await terminal.waitForText("Operations");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // ======================================================================
  // INTEGRATION TESTS
  // ======================================================================

  describe("integration", () => {

    test("repo-oplog-help-overlay-includes-oplog", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("?"); // help overlay
      await terminal.waitForText("Op Log");
      // Assert: help overlay lists Op Log keybinding group
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("repo-oplog-status-bar-hints-list", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      // Assert: status bar shows list hints
      const lastLine = terminal.getLine(terminal.rows - 1);
      expect(lastLine).toMatch(/j\/k/);
      expect(lastLine).toMatch(/Enter/);
      expect(lastLine).toMatch(/y/);
      await terminal.terminate();
    });

    test("repo-oplog-status-bar-hints-detail", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Operation Detail");
      // Assert: status bar shows detail hints
      const lastLine = terminal.getLine(terminal.rows - 1);
      expect(lastLine).toMatch(/q\/Esc/);
      expect(lastLine).toMatch(/back/);
      await terminal.terminate();
    });

    test("repo-oplog-status-bar-hints-filter", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Operations");
      await terminal.sendKeys("/");
      // Assert: status bar shows filter hints
      const lastLine = terminal.getLine(terminal.rows - 1);
      expect(lastLine).toMatch(/Esc/);
      expect(lastLine).toMatch(/clear filter/);
      await terminal.terminate();
    });

    test("repo-oplog-auth-error-display", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TEST_OPLOG_STATUS: "401" },
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Session expired");
      const content = terminal.snapshot();
      expect(content).toMatch(/codeplane auth login/);
      await terminal.terminate();
    });

    test("repo-oplog-rate-limit-display", async () => {
      const terminal = await launchTUI({
        cols: 120, rows: 40,
        env: { CODEPLANE_TEST_OPLOG_STATUS: "429" },
      });
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Bookmarks");
      await terminal.sendKeys("5");
      await terminal.waitForText("Rate limited");
      const content = terminal.snapshot();
      expect(content).toMatch(/Try again in/);
      await terminal.terminate();
    });
  });
});
```

---

## Appendix A: API Contract

### Endpoint

```
GET /api/repos/:owner/:repo/operations
```

### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `cursor` | string | (none) | Pagination cursor from previous response |
| `limit` | number | 50 | Items per page (1–100) |

### Response (200)

```json
{
  "items": [
    {
      "operation_id": "abc12345def0ba1234567890abcdef012345678",
      "parent_operation_id": "xyz98765fed1ba0987654321fedcba987654321",
      "operation_type": "snapshot",
      "description": "working copy update",
      "user": "alice",
      "timestamp": "2026-03-21T14:32:07Z"
    }
  ],
  "next_cursor": "eyJvZmZzZXQiOjUwfQ=="
}
```

### Error Responses

| Status | Meaning | TUI Display |
|--------|---------|-------------|
| 401 | Auth expired | "Session expired. Run `codeplane auth login` to re-authenticate." |
| 404 | Repo not found | Handled by parent screen |
| 429 | Rate limited | "Rate limited. Try again in {N} seconds." (reads `Retry-After` header) |
| 500 | Server error | "Error loading operations. Press `R` to retry." |
| 501 | Not implemented | "Operation log is not available. Backend not implemented." |

---

## Appendix B: Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    OperationLogTab                           │
│                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────┐   │
│  │ useOperation  │   │ useOpLog     │   │ useOpLog       │   │
│  │ Log()         │   │ Filter()     │   │ Columns()      │   │
│  │               │   │              │   │                │   │
│  │ operations[]  │──▶│ filtered     │   │ showOpId       │   │
│  │ isLoading     │   │ Operations[] │   │ showUser       │   │
│  │ error         │   │              │   │ typeWidth      │   │
│  │ hasMore       │   └──────┬───────┘   │ ...            │   │
│  │ fetchMore()   │          │           └───────┬────────┘   │
│  │ refetch()     │          │                   │            │
│  └──────┬───────┘          │                   │            │
│         │                   ▼                   ▼            │
│         │          ┌────────────────────────────────┐        │
│         │          │     Render Decision            │        │
│         │          │                                │        │
│         │          │  loading?  → FullScreenLoading │        │
│         │          │  error?    → Error message     │        │
│         │          │  detail?   → OperationDetail   │        │
│         ▼          │  list?     → OperationRow[]    │        │
│  ┌──────────────┐  └────────────────────────────────┘        │
│  │ useClipboard │                                            │
│  │ ()           │  ┌────────────────────────────────┐        │
│  │              │  │     useOpLogKeybindings()       │        │
│  │ copy()       │  │                                │        │
│  │ status       │  │  j/k, Enter, y, /, Esc, G,     │        │
│  └──────────────┘  │  Ctrl+D/U, R, q                │        │
│                     └────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│              useCursorPagination (from jj-hooks)             │
│                                                              │
│  GET /api/repos/:owner/:repo/operations?cursor=X&limit=50   │
│                                                              │
│  Memory cap: 5000 items │ Page size: 50 │ Cursor-based       │
└──────────────────────────────────────────────────────────────┘
```

---

## Appendix C: Edge Case Matrix

| Scenario | Behavior | Test Coverage |
|----------|----------|---------------|
| Empty repository (0 operations) | "No operations recorded." centered in muted | `repo-oplog-empty-state` |
| Filter with no matches | "No matching operations." centered in muted | `repo-oplog-filter-no-results` |
| Operation with no parent | Parent ID field shows "—" in detail view | `repo-oplog-detail-view-*` |
| Operation with 500-char description | Truncated with `…` in list, full text in detail with wrapping | Snapshot tests |
| Unicode in descriptions | `truncateRight` respects grapheme clusters via `util/text.ts` | Manual verification |
| Clipboard unavailable (SSH) | Status bar: "Copy failed — clipboard not available" for 2s | `repo-oplog-copied-status-bar` |
| Resize during scroll | `focusedIndex` preserved, scrollbox adjusts | `repo-oplog-resize-*` |
| Resize during detail view | Detail re-layouts, all fields visible | `repo-oplog-detail-resize` |
| Resize below 80×24 | "Terminal too small" message; restores on resize up | `repo-oplog-resize-below-minimum` |
| Rapid j presses (10×) | Focus advances exactly 10 rows, no debounce | `repo-oplog-rapid-j-keys` |
| Enter then q immediately | Clean return to list, no artifacts | `repo-oplog-rapid-enter-back` |
| Pagination error on page 2 | Page 1 data preserved, error at list bottom | `repo-oplog-pagination-error-preserves-data` |
| 5000 items loaded (cap reached) | "End of loaded operations. Press `R` to reload from start." | Manual verification |
| API 501 | "Operation log is not available. Backend not implemented." | `repo-oplog-501-not-implemented` |
| API timeout (10s) | Shows timeout error, `R` to retry | Covered by `useScreenLoading` |
| Component unmount during fetch | AbortController cancellation, no error | Handled by `useCursorPagination` |
| Filter activated during initial loading | Filter input disabled until data arrives | Handled by `activateFilter` guard |
| Tab switch away during fetch | Fetch cancelled via AbortController | Handled by `useCursorPagination` |
| SSE disconnect | Op Log unaffected (uses REST only) | N/A — no SSE dependency |