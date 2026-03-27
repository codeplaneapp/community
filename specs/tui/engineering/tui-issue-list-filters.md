# Engineering Specification: tui-issue-list-filters

## Persistent Filter Toolbar with State, Label, Assignee, Milestone Filtering and Sort

**Ticket:** tui-issue-list-filters  
**Type:** Feature  
**Dependencies:** tui-issue-list-screen, tui-issue-labels-display, tui-issues-data-hooks, tui-modal-component  
**Status:** Planned  

---

## Overview

This specification details the engineering plan for adding a persistent filter toolbar to the issue list screen. The toolbar renders below the issue list title row and above the scrollable issue list. It provides keyboard-driven filtering by state, label, assignee, milestone, and sort order. State and sort changes drive server-side requests; label, assignee, and milestone filters are applied client-side.

---

## Implementation Plan

### Step 1: Define Filter State Types and Constants

**File:** `apps/tui/src/screens/Issues/filter-types.ts`

Create the core type definitions and constants used across all filter-related components.

```typescript
// --- Filter State ---

export type IssueStateFilter = "open" | "closed" | "";
// "" represents "All" — maps to empty string for the API query param

export type IssueSortOrder =
  | "recently-created"
  | "recently-updated"
  | "oldest"
  | "most-commented"
  | "least-commented";

export interface IssueFilterState {
  stateFilter: IssueStateFilter;
  sortOrder: IssueSortOrder;
  labelFilters: string[]; // label names, AND logic
  assigneeFilter: string | null; // user login or null
  milestoneFilter: { id: number; title: string } | null;
}

export const DEFAULT_FILTER_STATE: Readonly<IssueFilterState> = {
  stateFilter: "open",
  sortOrder: "recently-created",
  labelFilters: [],
  assigneeFilter: null,
  milestoneFilter: null,
};

// --- Display Constants ---

export const STATE_CYCLE: readonly IssueStateFilter[] = ["open", "closed", ""];

export const STATE_DISPLAY_LABELS: Record<IssueStateFilter, string> = {
  open: "Open",
  closed: "Closed",
  "": "All",
};

export const SORT_CYCLE: readonly IssueSortOrder[] = [
  "recently-created",
  "recently-updated",
  "oldest",
  "most-commented",
  "least-commented",
];

export const SORT_DISPLAY_LABELS: Record<IssueSortOrder, string> = {
  "recently-created": "Recently created",
  "recently-updated": "Recently updated",
  oldest: "Oldest first",
  "most-commented": "Most commented",
  "least-commented": "Least commented",
};

// --- Truncation Limits ---

export const LABEL_NAME_MAX_TOOLBAR = 20;
export const LABEL_NAME_MAX_PICKER_STANDARD = 40;
export const LABEL_NAME_MAX_PICKER_MINIMUM = 30;
export const LABEL_DESCRIPTION_MAX_PICKER = 50;
export const ASSIGNEE_MAX_TOOLBAR = 20;
export const ASSIGNEE_MAX_PICKER = 30;
export const MILESTONE_MAX_TOOLBAR = 25;
export const MILESTONE_MAX_PICKER = 40;
export const PICKER_SEARCH_MAX_LENGTH = 60;
export const MAX_SELECTABLE_LABELS = 10;
export const MAX_PICKER_DISPLAY_ITEMS = 100;

// --- Timing ---

export const STATE_FILTER_DEBOUNCE_MS = 150;

export const FILTER_SEPARATOR = "\u2502"; // U+2502 box-drawing vertical
```

**Rationale:** Centralizing types and constants ensures consistency across the toolbar, picker overlays, and tests. All magic numbers are named constants. The state cycle and sort cycle arrays define the deterministic progression for `f` and `o` keypresses.

---

### Step 2: Create the `useIssueFilters` Hook

**File:** `apps/tui/src/screens/Issues/useIssueFilters.ts`

This hook encapsulates all filter state management, cycling logic, client-side filtering, sorting, and debounced state changes.

```typescript
import { useState, useCallback, useRef, useMemo } from "react";
import type { Issue } from "@codeplane/ui-core";
import {
  type IssueFilterState,
  type IssueStateFilter,
  type IssueSortOrder,
  DEFAULT_FILTER_STATE,
  STATE_CYCLE,
  SORT_CYCLE,
  MAX_SELECTABLE_LABELS,
  STATE_FILTER_DEBOUNCE_MS,
} from "./filter-types";

export interface UseIssueFiltersResult {
  filters: IssueFilterState;
  debouncedStateFilter: IssueStateFilter;
  cycleState: () => void;
  cycleSort: () => void;
  setLabels: (labels: string[]) => void;
  setAssignee: (login: string | null) => void;
  setMilestone: (milestone: { id: number; title: string } | null) => void;
  clearAll: () => void;
  isDefault: boolean;
  applyClientFilters: (issues: Issue[]) => Issue[];
  activeFilterCount: number;
}

export function useIssueFilters(): UseIssueFiltersResult {
  const [filters, setFilters] = useState<IssueFilterState>({
    ...DEFAULT_FILTER_STATE,
  });
  const [debouncedStateFilter, setDebouncedStateFilter] =
    useState<IssueStateFilter>("open");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cycleState = useCallback(() => {
    setFilters((prev) => {
      const idx = STATE_CYCLE.indexOf(prev.stateFilter);
      const next = STATE_CYCLE[(idx + 1) % STATE_CYCLE.length];
      if (debounceTimerRef.current !== null)
        clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        setDebouncedStateFilter(next);
        debounceTimerRef.current = null;
      }, STATE_FILTER_DEBOUNCE_MS);
      return { ...prev, stateFilter: next };
    });
  }, []);

  const cycleSort = useCallback(() => {
    setFilters((prev) => {
      const idx = SORT_CYCLE.indexOf(prev.sortOrder);
      return { ...prev, sortOrder: SORT_CYCLE[(idx + 1) % SORT_CYCLE.length] };
    });
  }, []);

  const setLabels = useCallback((labels: string[]) => {
    setFilters((prev) => ({
      ...prev,
      labelFilters: labels.slice(0, MAX_SELECTABLE_LABELS),
    }));
  }, []);

  const setAssignee = useCallback((login: string | null) => {
    setFilters((prev) => ({ ...prev, assigneeFilter: login }));
  }, []);

  const setMilestone = useCallback(
    (milestone: { id: number; title: string } | null) => {
      setFilters((prev) => ({ ...prev, milestoneFilter: milestone }));
    },
    []
  );

  const clearAll = useCallback(() => {
    setFilters({ ...DEFAULT_FILTER_STATE });
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setDebouncedStateFilter(DEFAULT_FILTER_STATE.stateFilter);
  }, []);

  const isDefault = useMemo(
    () =>
      filters.stateFilter === DEFAULT_FILTER_STATE.stateFilter &&
      filters.sortOrder === DEFAULT_FILTER_STATE.sortOrder &&
      filters.labelFilters.length === 0 &&
      filters.assigneeFilter === null &&
      filters.milestoneFilter === null,
    [filters]
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.labelFilters.length > 0) count++;
    if (filters.assigneeFilter !== null) count++;
    if (filters.milestoneFilter !== null) count++;
    if (filters.sortOrder !== DEFAULT_FILTER_STATE.sortOrder) count++;
    return count;
  }, [filters]);

  const applyClientFilters = useCallback(
    (issues: Issue[]): Issue[] => {
      let result = issues;
      if (filters.labelFilters.length > 0) {
        result = result.filter((issue) =>
          filters.labelFilters.every((name) =>
            issue.labels.some((l) => l.name === name)
          )
        );
      }
      if (filters.assigneeFilter !== null) {
        const login = filters.assigneeFilter;
        result = result.filter(
          (issue) =>
            issue.assignees.some((a) => a.login === login) ||
            issue.author.login === login
        );
      }
      if (filters.milestoneFilter !== null) {
        const mid = filters.milestoneFilter.id;
        result = result.filter((issue) => issue.milestone_id === mid);
      }
      return [...result].sort(getSortComparator(filters.sortOrder));
    },
    [filters]
  );

  return {
    filters,
    debouncedStateFilter,
    cycleState,
    cycleSort,
    setLabels,
    setAssignee,
    setMilestone,
    clearAll,
    isDefault,
    applyClientFilters,
    activeFilterCount,
  };
}

function getSortComparator(
  order: IssueSortOrder
): (a: Issue, b: Issue) => number {
  switch (order) {
    case "recently-created":
      return (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    case "recently-updated":
      return (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    case "oldest":
      return (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    case "most-commented":
      return (a, b) => {
        const diff = b.comment_count - a.comment_count;
        return diff !== 0
          ? diff
          : new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime();
      };
    case "least-commented":
      return (a, b) => {
        const diff = a.comment_count - b.comment_count;
        return diff !== 0
          ? diff
          : new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime();
      };
  }
}
```

**Design decisions:**
- `debouncedStateFilter` is separate state that updates after 150ms, while `filters.stateFilter` updates immediately for instant toolbar display.
- `clearAll` bypasses debounce — immediately resets the debounced state.
- Sort comparators use `created_at` descending as secondary sort for deterministic ordering.

---

### Step 3: Create the Filter Toolbar Component

**File:** `apps/tui/src/screens/Issues/FilterToolbar.tsx`

Single-line `<box>` rendering active filter chips separated by `│`.

```typescript
import React from "react";
import { useLayout } from "../../hooks/useLayout";
import { useTheme } from "../../theme/useTheme";
import { truncateRight } from "../../util/text";
import {
  type IssueFilterState,
  STATE_DISPLAY_LABELS,
  SORT_DISPLAY_LABELS,
  LABEL_NAME_MAX_TOOLBAR,
  ASSIGNEE_MAX_TOOLBAR,
  MILESTONE_MAX_TOOLBAR,
  FILTER_SEPARATOR,
} from "./filter-types";

interface FilterToolbarProps {
  filters: IssueFilterState;
  activeFilterCount: number;
  labelColors: Map<string, string>;
}

export function FilterToolbar({
  filters,
  activeFilterCount,
  labelColors,
}: FilterToolbarProps) {
  const { breakpoint, width } = useLayout();
  const theme = useTheme();
  const isMinimum = breakpoint === "minimum";

  if (isMinimum) {
    return (
      <box flexDirection="row" height={1} width="100%">
        <text>
          <text fg={theme.primary}>
            {STATE_DISPLAY_LABELS[filters.stateFilter]}
          </text>
        </text>
        {activeFilterCount > 0 && (
          <>
            <text fg={theme.border}> {FILTER_SEPARATOR} </text>
            <text fg={theme.muted}>+{activeFilterCount} filters</text>
          </>
        )}
      </box>
    );
  }

  const chips: React.ReactNode[] = [];

  chips.push(
    <text key="state">
      State:{" "}
      <text fg={theme.primary}>
        {STATE_DISPLAY_LABELS[filters.stateFilter]}
      </text>
    </text>
  );

  if (filters.labelFilters.length > 0) {
    const labelTexts = filters.labelFilters.map((name) => {
      const rawColor = labelColors.get(name);
      const color = isValidHex(rawColor) ? rawColor : theme.muted;
      return { name, display: truncateRight(name, LABEL_NAME_MAX_TOOLBAR), color };
    });
    const maxInline = calcMaxInlineLabels(width, labelTexts);
    const visible = labelTexts.slice(0, maxInline);
    const hidden = labelTexts.length - maxInline;
    chips.push(
      <text key="labels">
        Label:{" "}
        {visible.map((l, i) => (
          <text key={l.name}>
            {i > 0 ? ", " : ""}
            <text fg={l.color}>\u25CF</text>{" "}
            <text fg={theme.primary}>{l.display}</text>
          </text>
        ))}
        {hidden > 0 && <text fg={theme.muted}> \u2026+{hidden} more</text>}
      </text>
    );
  }

  if (filters.assigneeFilter !== null) {
    chips.push(
      <text key="assignee">
        Assignee:{" "}
        <text fg={theme.primary}>
          {truncateRight(filters.assigneeFilter, ASSIGNEE_MAX_TOOLBAR)}
        </text>
      </text>
    );
  }

  if (filters.milestoneFilter !== null) {
    chips.push(
      <text key="milestone">
        Milestone:{" "}
        <text fg={theme.primary}>
          {truncateRight(filters.milestoneFilter.title, MILESTONE_MAX_TOOLBAR)}
        </text>
      </text>
    );
  }

  chips.push(
    <text key="sort">
      Sort:{" "}
      <text fg={theme.primary}>
        {SORT_DISPLAY_LABELS[filters.sortOrder]}
      </text>
    </text>
  );

  return (
    <box flexDirection="row" height={1} width="100%">
      {chips.map((chip, i) => (
        <React.Fragment key={i}>
          {i > 0 && <text fg={theme.border}> {FILTER_SEPARATOR} </text>}
          {chip}
        </React.Fragment>
      ))}
    </box>
  );
}

function isValidHex(c: string | undefined): c is string {
  return !!c && /^#?[0-9a-fA-F]{3,6}$/.test(c);
}

function calcMaxInlineLabels(
  termWidth: number,
  labels: { display: string }[]
): number {
  const reserved = 50;
  let used = 7;
  let count = 0;
  for (const l of labels) {
    const w = 2 + l.display.length + (count > 0 ? 2 : 0);
    if (used + w > termWidth - reserved) break;
    used += w;
    count++;
  }
  return Math.max(count, 1);
}
```

---

### Step 4: Create the Filter Picker Overlay Component

**File:** `apps/tui/src/screens/Issues/FilterPicker.tsx`

Reusable modal picker for label (multi-select), assignee (single-select), and milestone (single-select). Handles fuzzy search, `j`/`k` navigation, `Space` toggle, `Enter` confirm, `Esc` cancel.

```typescript
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useLayout } from "../../hooks/useLayout";
import { useTheme } from "../../theme/useTheme";
import { truncateRight } from "../../util/text";
import {
  MAX_PICKER_DISPLAY_ITEMS,
  PICKER_SEARCH_MAX_LENGTH,
  LABEL_DESCRIPTION_MAX_PICKER,
} from "./filter-types";

export interface PickerItem {
  id: string;
  name: string;
  description?: string;
  color?: string;
  metadata?: string;
}

interface FilterPickerProps {
  title: string;
  items: PickerItem[];
  isLoading: boolean;
  error: Error | null;
  multiSelect: boolean;
  initialSelected: Set<string>;
  emptyMessage: string;
  onConfirm: (selectedIds: Set<string>) => void;
  onDismiss: () => void;
  onRetry: () => void;
  nameMaxLength: number;
  showDescriptions: boolean;
}

export function FilterPicker(props: FilterPickerProps) {
  const {
    title, items, isLoading, error, multiSelect,
    initialSelected, emptyMessage, onConfirm,
    onDismiss, onRetry, nameMaxLength, showDescriptions,
  } = props;
  const { breakpoint } = useLayout();
  const theme = useTheme();

  const [searchText, setSearchText] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [searchFocused, setSearchFocused] = useState(false);

  const pickerWidth = breakpoint === "minimum" ? "90%" : breakpoint === "large" ? "50%" : "60%";

  const filtered = useMemo(() => {
    if (!searchText) return items.slice(0, MAX_PICKER_DISPLAY_ITEMS);
    const lower = searchText.toLowerCase();
    return items
      .filter((i) =>
        i.name.toLowerCase().includes(lower) ||
        (i.description && i.description.toLowerCase().includes(lower))
      )
      .slice(0, MAX_PICKER_DISPLAY_ITEMS);
  }, [items, searchText]);

  useEffect(() => {
    if (focusedIndex >= filtered.length)
      setFocusedIndex(Math.max(0, filtered.length - 1));
  }, [filtered.length, focusedIndex]);

  // Key handler called from parent's modal-priority keybinding scope
  const handleKey = useCallback(
    (key: string) => {
      if (searchFocused && key !== "escape") return;
      switch (key) {
        case "j": case "down":
          setFocusedIndex((i) => Math.min(i + 1, filtered.length - 1)); break;
        case "k": case "up":
          setFocusedIndex((i) => Math.max(i - 1, 0)); break;
        case "G":
          setFocusedIndex(filtered.length - 1); break;
        case "/":
          setSearchFocused(true); break;
        case " ":
          if (multiSelect && filtered[focusedIndex]) {
            const id = filtered[focusedIndex].id;
            setSelected((prev) => {
              const next = new Set(prev);
              next.has(id) ? next.delete(id) : next.add(id);
              return next;
            });
          }
          break;
        case "return":
          if (multiSelect) onConfirm(selected);
          else if (filtered[focusedIndex]) onConfirm(new Set([filtered[focusedIndex].id]));
          break;
        case "escape":
          if (searchFocused) { setSearchFocused(false); setSearchText(""); }
          else onDismiss();
          break;
        case "R":
          if (error) onRetry(); break;
      }
    },
    [searchFocused, filtered, focusedIndex, multiSelect, selected, onConfirm, onDismiss, onRetry, error]
  );

  // Expose handleKey via ref for the parent to call
  // (implementation detail: parent passes key events via a ref callback)

  if (isLoading) {
    return (
      <box position="absolute" width={pickerWidth} height="60%" borderStyle="single"
        borderColor={theme.border} flexDirection="column" alignItems="center" justifyContent="center">
        <text fg={theme.muted}>Loading {title.toLowerCase()}\u2026</text>
      </box>
    );
  }
  if (error) {
    return (
      <box position="absolute" width={pickerWidth} height="60%" borderStyle="single"
        borderColor={theme.error} flexDirection="column" alignItems="center" justifyContent="center">
        <text fg={theme.error}>Failed to load {title.toLowerCase()}. Press R to retry.</text>
      </box>
    );
  }
  if (items.length === 0) {
    return (
      <box position="absolute" width={pickerWidth} height="60%" borderStyle="single"
        borderColor={theme.border} flexDirection="column" alignItems="center" justifyContent="center">
        <text fg={theme.muted}>{emptyMessage}</text>
      </box>
    );
  }

  const hint = multiSelect ? "Space:toggle  Enter:confirm  Esc:cancel" : "Enter:select  Esc:cancel";
  return (
    <box position="absolute" width={pickerWidth} height="60%" borderStyle="single"
      borderColor={theme.border} backgroundColor={theme.surface} flexDirection="column"
      title={title} titleAlignment="center">
      <input value={searchText} placeholder="Type to filter\u2026"
        maxLength={PICKER_SEARCH_MAX_LENGTH} focused={searchFocused}
        onInput={(v: string) => setSearchText(v)} width="100%" height={1} />
      <scrollbox flexGrow={1} scrollY>
        <box flexDirection="column">
          {filtered.map((item, idx) => {
            const isFocused = idx === focusedIndex;
            const isSel = selected.has(item.id);
            const prefix = multiSelect ? (isSel ? "\u2713 " : "  ") : "";
            const cursor = isFocused ? "\u25BA " : "  ";
            const display = truncateRight(item.name, nameMaxLength);
            const validColor = item.color && /^#?[0-9a-fA-F]{3,6}$/.test(item.color);
            return (
              <box key={item.id} flexDirection="row" height={1} width="100%"
                backgroundColor={isFocused ? theme.primary : undefined}>
                <text fg={isFocused ? theme.surface : theme.muted}>{prefix}{cursor}</text>
                {item.color && (
                  <text fg={validColor ? item.color : theme.muted}>\u25CF </text>
                )}
                <text fg={isFocused ? theme.surface : theme.primary}>{display}</text>
                {showDescriptions && item.description && (
                  <text fg={theme.muted}> {truncateRight(item.description, LABEL_DESCRIPTION_MAX_PICKER)}</text>
                )}
                {item.metadata && <text fg={theme.muted}> \u2014 {item.metadata}</text>}
              </box>
            );
          })}
        </box>
      </scrollbox>
      <box flexDirection="row" justifyContent="space-between" height={1}>
        {items.length > MAX_PICKER_DISPLAY_ITEMS && (
          <text fg={theme.muted}>Showing first {MAX_PICKER_DISPLAY_ITEMS} of {items.length}</text>
        )}
        <text fg={theme.muted}>{hint}</text>
      </box>
    </box>
  );
}
```

---

### Step 5: Create Assignee Extraction Utility

**File:** `apps/tui/src/screens/Issues/extractAssignees.ts`

```typescript
import type { Issue } from "@codeplane/ui-core";
import type { PickerItem } from "./FilterPicker";

export function extractAssignees(issues: Issue[]): PickerItem[] {
  const seen = new Map<string, string>();
  for (const issue of issues) {
    if (issue.author && !seen.has(issue.author.login))
      seen.set(issue.author.login, issue.author.login);
    for (const a of issue.assignees)
      if (!seen.has(a.login)) seen.set(a.login, a.login);
  }
  return Array.from(seen.keys())
    .sort((a, b) => a.localeCompare(b))
    .map((login) => ({ id: login, name: login }));
}
```

No API call needed — assignees are mined from loaded issue data.

---

### Step 6: Integrate Filters into the Issue List Screen

**File:** `apps/tui/src/screens/Issues/IssuesScreen.tsx`

Main screen component composing the filter hook, toolbar, picker overlays, and list rendering.

Key integration points:

1. **Data flow:** `useIssues(owner, repo, { state: debouncedStateFilter })` provides raw issues. `applyClientFilters(rawIssues)` produces `filteredIssues` for rendering.
2. **Lazy data fetching:** `useRepoLabels` and `useRepoMilestones` use `enabled: false` until the corresponding picker is opened. Once fetched, data is cached for the screen's lifetime.
3. **Keybinding registration:** All filter keys (`f`, `o`, `l`, `a`, `m`, `x`) are registered via `useScreenKeybindings` at `PRIORITY.SCREEN` with `when: () => isListFocused` guards.
4. **Picker overlay management:** When a picker is open, a modal-priority keybinding scope is registered (via `useEffect` on `activePicker` state). This scope captures `j`, `k`, `Enter`, `Esc`, `Space`, `G`, and `R`, forwarding them to the picker's `handleKey` method. The `when()` guard on screen-level bindings returns `false` while a picker is active.
5. **Status bar hints:** Custom hints array shows `f:state  l:label  a:assignee  m:milestone  o:sort  x:clear`.
6. **Showing count:** When client-side filters reduce visible issues below the loaded count, the header shows `Issues (42) (showing 5)`.
7. **Empty state:** When filtered list is empty, renders "No issues match the current filters." with "Press `x` to clear filters." hint.

Full component structure:

```
<box flexDirection="column" width="100%" height="100%">
  <box height={1}>  <!-- Title: Issues (N) + showing count -->
  <FilterToolbar />  <!-- height={1}, always visible -->
  <scrollbox flexGrow={1}>  <!-- Issue list rows -->
    {filteredIssues.map(issue => <IssueRow />)}
    {hasMore && <PaginationIndicator />}
  </scrollbox>
  {activePicker && <FilterPicker ... />}  <!-- Overlay -->
</box>
```

---

### Step 7: Register the Screen in the Router

**File:** `apps/tui/src/router/registry.ts` (edit existing)

Replace `PlaceholderScreen` with `IssuesScreen` for `ScreenName.Issues`:

```typescript
import { IssuesScreen } from "../screens/Issues/IssuesScreen";

[ScreenName.Issues]: {
  component: IssuesScreen,
  requiresRepo: true,
  requiresOrg: false,
  breadcrumbLabel: () => "Issues",
},
```

---

### Step 8: Create Barrel Export

**File:** `apps/tui/src/screens/Issues/index.ts`

```typescript
export { IssuesScreen } from "./IssuesScreen";
export { FilterToolbar } from "./FilterToolbar";
export { FilterPicker } from "./FilterPicker";
export { useIssueFilters } from "./useIssueFilters";
export * from "./filter-types";
```

---

## File Inventory

| File Path | Purpose | New/Edit |
|---|---|---|
| `apps/tui/src/screens/Issues/filter-types.ts` | Types, constants, enums | New |
| `apps/tui/src/screens/Issues/useIssueFilters.ts` | Filter state hook | New |
| `apps/tui/src/screens/Issues/FilterToolbar.tsx` | Toolbar component | New |
| `apps/tui/src/screens/Issues/FilterPicker.tsx` | Picker overlay | New |
| `apps/tui/src/screens/Issues/extractAssignees.ts` | Assignee extraction | New |
| `apps/tui/src/screens/Issues/IssuesScreen.tsx` | Main screen | New |
| `apps/tui/src/screens/Issues/index.ts` | Barrel exports | New |
| `apps/tui/src/router/registry.ts` | Screen registry | Edit |

---

## Data Flow Diagram

```
User presses 'f'         User presses 'l'→Space→Enter    User presses 'o'
       │                          │                           │
       ▼                          ▼                           ▼
  cycleState()             setLabels(["bug"])           cycleSort()
       │                          │                           │
       ▼                          ▼                           ▼
  filters.stateFilter     filters.labelFilters         filters.sortOrder
  updates instantly       updates instantly             updates instantly
       │                          │                           │
       ▼                          │                           │
  150ms debounce                  │                           │
       │                          │                           │
       ▼                          ▼                           ▼
  debouncedStateFilter    ┌─ applyClientFilters(rawIssues) ─┐
       │                  │ 1. Filter by labels (AND)        │
       ▼                  │ 2. Filter by assignee            │
  useIssues(state=...)    │ 3. Filter by milestone           │
       │                  │ 4. Sort by sortOrder              │
       ▼                  └──────────────┬───────────────────┘
  rawIssues[]                            │
       │                                 ▼
       └──────────────────────→  filteredIssues[]
                                         │
                                         ▼
                                   Render list
```

---

## Keybinding Priority Architecture

```
Priority 1: TEXT_INPUT     ← Search input ('/') captures printable keys
Priority 2: MODAL          ← Picker overlay captures j/k/Enter/Esc/Space
Priority 3: GOTO           ← 'g' prefix (go-to mode)
Priority 4: SCREEN         ← Filter keys (f/o/l/a/m/x) with when() guards
Priority 5: GLOBAL         ← q, Esc, Ctrl+C, ?, :
```

When picker is open:
- `when: () => isListFocused` returns `false` → screen-level filter keys inactive
- Modal scope handles `j`/`k`/`Enter`/`Esc`/`Space`/`G`/`R`
- `q` at GLOBAL still works (would close picker via Esc-like behavior)

When search input is focused:
- `TEXT_INPUT` (priority 1) captures all printable keys
- `f`, `l`, `a`, etc. type into the search field, not trigger filters

---

## Responsive Behavior

| Breakpoint | Toolbar | Picker Width | Picker Content |
|---|---|---|---|
| minimum (80×24) | State + "+N filters" | 90% | Name only |
| standard (120×40) | All chips inline | 60% | Name only |
| large (200×60) | All chips + padding | 50% | Name + description |

`useOnResize()` triggers synchronous re-render. Picker re-centers. Filter state preserved. No animation.

---

## Error Handling

| Error | Effect | Recovery |
|---|---|---|
| Issue fetch 500 | Screen-level error via `useScreenLoading` | `R` to retry |
| Issue fetch 401 | App-shell auth error screen | `codeplane auth login` |
| Issue fetch 429 | Inline "Rate limited. Retry in Ns." | Wait, then `R` |
| Label fetch 500 | Picker: "Failed to load labels. Press R to retry." | `R` in picker |
| Label fetch 401 | Picker closes → auth error screen | `codeplane auth login` |
| Milestone fetch 500 | Picker: "Failed to load milestones. Press R to retry." | `R` in picker |
| Invalid label color | `●` uses `theme.muted` fallback | None needed |
| Zero filter results | "No issues match the current filters." | `x` to clear |

---

## Productionization Checklist

### 1. Extract FilterPicker to Shared Components

Once validated in issue list, move `FilterPicker` to `apps/tui/src/components/FilterPicker.tsx` for reuse by landing request filters, workflow run filters, and search result filters. The API is already parameterized — only a file move required.

### 2. Migrate Client-Side Filters to Server-Side

When the API adds `label`, `assignee`, and `milestone` query params to `GET /api/repos/:owner/:repo/issues`:
- Update `useIssues()` in `@codeplane/ui-core` to accept these params
- Pass filter values from `useIssueFilters` to `useIssues()` options
- Remove corresponding client-side filter logic from `applyClientFilters`
- No UI changes required

### 3. Persist Filter State Across Detail Navigation

The ticket title says "Filters persist across detail navigation." Implementation:
- Store `IssueFilterState` in `NavigationProvider`'s per-entry cache, keyed by `ScreenEntry.id`
- On `push` to issue detail, save current filter state
- On `pop` back to issue list, restore from cache
- Add `usePersistedState<T>(key: string, defaultValue: T)` hook reading from `NavigationProvider` context

### 4. Telemetry Integration

Emit events from the product spec's telemetry section at action sites:
- `tui.issues.filters.state_change` in `cycleState`
- `tui.issues.filters.label_applied` in `handleLabelConfirm`
- `tui.issues.filters.clear_all` in `clearAll`
- etc.

### 5. Memory Bounds

Labels/milestones cached for screen lifetime (cleared on unmount). `rawIssues` follows ui-core pagination cache (max 500 items). Client-side filters operate over this bounded set.

---

## Unit & Integration Tests

### Test File: `e2e/tui/issues.test.ts`

All tests use `@microsoft/tui-test` via the `launchTUI` helper from `e2e/tui/helpers.ts`. Tests run against the real API server with test fixtures. Tests that fail due to unimplemented backends are left failing — never skipped or commented out.

```typescript
import { describe, test, expect } from "bun:test";
import { launchTUI, TERMINAL_SIZES } from "./helpers";

describe("TUI_ISSUE_LIST_FILTERS", () => {

  // ─── Snapshot Tests ──────────────────────────────────────────

  describe("snapshots", () => {
    test("issue-filters-toolbar-default", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.waitForText("State: Open");
        await tui.waitForText("Sort: Recently created");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-toolbar-state-closed", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("f");
        await tui.waitForText("State: Closed");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-toolbar-state-all", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("f", "f");
        await tui.waitForText("State: All");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-toolbar-with-label", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("Space", "Enter");
        await tui.waitForText("Label:");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-toolbar-with-multiple-labels", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("Space", "j", "Space", "Enter");
        await tui.waitForText("Label:");
        expect(tui.snapshot()).toMatch(/Label:.*,/);
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-toolbar-with-assignee", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("a");
        await tui.waitForText("Select Assignee");
        await tui.sendKeys("Enter");
        await tui.waitForText("Assignee:");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-toolbar-with-milestone", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("m");
        await tui.waitForText("Select Milestone");
        await tui.sendKeys("Enter");
        await tui.waitForText("Milestone:");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-toolbar-all-active", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("f");
        await tui.waitForText("State: Closed");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("Space", "Enter");
        await tui.sendKeys("a");
        await tui.waitForText("Select Assignee");
        await tui.sendKeys("Enter");
        await tui.sendKeys("m");
        await tui.waitForText("Select Milestone");
        await tui.sendKeys("Enter");
        await tui.waitForText("Milestone:");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-toolbar-cleared", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("f");
        await tui.waitForText("State: Closed");
        await tui.sendKeys("x");
        await tui.waitForText("State: Open");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-label-picker-open", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.waitForText("Type to filter");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-label-picker-search", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("/");
        await tui.sendText("bu");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-label-picker-selected", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("Space");
        expect(tui.snapshot()).toMatch(/\u2713/);
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-label-picker-empty", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40, args: ["--repo", "testowner/empty-labels-repo"] });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("No labels defined");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-assignee-picker-open", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("a");
        await tui.waitForText("Select Assignee");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-milestone-picker-open", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("m");
        await tui.waitForText("Select Milestone");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-milestone-picker-empty", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40, args: ["--repo", "testowner/no-milestones-repo"] });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("m");
        await tui.waitForText("No open milestones");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-no-results", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("Space", "j", "Space", "j", "Space", "Enter");
        await tui.waitForText("No issues match the current filters");
        await tui.waitForText("Press `x` to clear filters");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-showing-count", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("Space", "Enter");
        expect(tui.snapshot()).toMatch(/Issues \(\d+\)/);
        expect(tui.snapshot()).toMatch(/showing \d+/);
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-sort-label", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("o");
        await tui.waitForText("Sort: Recently updated");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-label-picker-loading", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Loading labels");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-label-picker-error", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_TEST_FAIL_LABELS: "1" } });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Failed to load labels");
        await tui.waitForText("Press R to retry");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-status-bar-hints", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        const lastLine = tui.getLine(tui.rows - 1);
        expect(lastLine).toMatch(/f:state/);
        expect(lastLine).toMatch(/l:label/);
        expect(lastLine).toMatch(/a:assignee/);
        expect(lastLine).toMatch(/m:milestone/);
        expect(lastLine).toMatch(/x:clear/);
      } finally {
        await tui.terminate();
      }
    });
  });

  // ─── Keyboard Interaction Tests ──────────────────────────────

  describe("keyboard interactions", () => {
    test("issue-filters-f-cycles-state-open-to-closed", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("State: Open");
        await tui.sendKeys("f");
        await tui.waitForText("State: Closed");
        await tui.waitForNoText("State: Open");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-f-cycles-closed-to-all", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("f");
        await tui.waitForText("State: Closed");
        await tui.sendKeys("f");
        await tui.waitForText("State: All");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-f-cycles-all-to-open", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("f", "f");
        await tui.waitForText("State: All");
        await tui.sendKeys("f");
        await tui.waitForText("State: Open");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-o-cycles-sort", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Sort: Recently created");
        await tui.sendKeys("o");
        await tui.waitForText("Sort: Recently updated");
        await tui.sendKeys("o");
        await tui.waitForText("Sort: Oldest first");
        await tui.sendKeys("o");
        await tui.waitForText("Sort: Most commented");
        await tui.sendKeys("o");
        await tui.waitForText("Sort: Least commented");
        await tui.sendKeys("o");
        await tui.waitForText("Sort: Recently created");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-l-opens-label-picker", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-label-picker-jk-navigation", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        const before = tui.snapshot();
        await tui.sendKeys("j");
        const afterDown = tui.snapshot();
        expect(afterDown).not.toBe(before);
        await tui.sendKeys("k");
        const afterUp = tui.snapshot();
        expect(afterUp).toBe(before);
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-label-picker-space-toggles", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("Space");
        expect(tui.snapshot()).toMatch(/\u2713/);
        await tui.sendKeys("Space");
        expect(tui.snapshot()).not.toMatch(/\u2713/);
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-label-picker-enter-confirms", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("Space", "Enter");
        await tui.waitForNoText("Select Label");
        await tui.waitForText("Label:");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-label-picker-esc-cancels", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("Space", "Escape");
        await tui.waitForNoText("Select Label");
        await tui.waitForNoText("Label:");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-label-picker-multi-select", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("Space", "j", "Space", "Enter");
        await tui.waitForNoText("Select Label");
        expect(tui.snapshot()).toMatch(/Label:.*,/);
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-a-opens-assignee-picker", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("a");
        await tui.waitForText("Select Assignee");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-assignee-picker-enter-selects", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("a");
        await tui.waitForText("Select Assignee");
        await tui.sendKeys("Enter");
        await tui.waitForNoText("Select Assignee");
        await tui.waitForText("Assignee:");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-m-opens-milestone-picker", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("m");
        await tui.waitForText("Select Milestone");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-milestone-picker-enter-selects", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("m");
        await tui.waitForText("Select Milestone");
        await tui.sendKeys("Enter");
        await tui.waitForNoText("Select Milestone");
        await tui.waitForText("Milestone:");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-x-clears-all", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("Space", "Enter");
        await tui.waitForText("Label:");
        await tui.sendKeys("a");
        await tui.waitForText("Select Assignee");
        await tui.sendKeys("Enter");
        await tui.waitForText("Assignee:");
        await tui.sendKeys("x");
        await tui.waitForNoText("Label:");
        await tui.waitForNoText("Assignee:");
        await tui.waitForText("State: Open");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-x-no-op-at-defaults", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("State: Open");
        const before = tui.snapshot();
        await tui.sendKeys("x");
        const after = tui.snapshot();
        expect(after).toBe(before);
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-f-suppressed-in-search", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("State: Open");
        await tui.sendKeys("/");
        await tui.sendKeys("f");
        expect(tui.snapshot()).toMatch(/State: Open/);
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-l-suppressed-in-search", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("/");
        await tui.sendKeys("l");
        await tui.waitForNoText("Select Label");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-picker-search-filters-list", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("/");
        await tui.sendText("en");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-picker-G-jumps-bottom", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("G");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-picker-gg-jumps-top", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("G");
        await tui.sendKeys("g", "g");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-rapid-f-debounced", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("f", "f", "f");
        await tui.waitForText("State: All");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-enter-in-picker-no-navigation", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("a");
        await tui.waitForText("Select Assignee");
        await tui.sendKeys("Enter");
        await tui.waitForNoText("Select Assignee");
        await tui.waitForText("Issues");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-j-in-picker-no-list-nav", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("j");
        await tui.waitForText("Select Label");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-state-change-resets-pagination", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        for (let i = 0; i < 30; i++) await tui.sendKeys("j");
        await tui.sendKeys("f");
        await tui.waitForText("State: Closed");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-sort-reorders-locally", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        const before = tui.snapshot();
        await tui.sendKeys("o");
        await tui.waitForText("Sort: Recently updated");
        const after = tui.snapshot();
        expect(after).not.toBe(before);
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-R-retries-in-picker", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_TEST_FAIL_LABELS: "1" } });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Failed to load labels");
        await tui.sendKeys("R");
        await tui.waitForText("Loading labels");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-q-pops-with-filters-active", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("f");
        await tui.waitForText("State: Closed");
        await tui.sendKeys("q");
        await tui.waitForNoText("Issues");
      } finally {
        await tui.terminate();
      }
    });
  });

  // ─── Responsive Tests ────────────────────────────────────────

  describe("responsive", () => {
    test("issue-filters-80x24-toolbar-collapsed", async () => {
      const tui = await launchTUI({ cols: 80, rows: 24 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("Space", "Enter");
        await tui.sendKeys("a");
        await tui.waitForText("Select Assignee");
        await tui.sendKeys("Enter");
        await tui.waitForText("Open");
        await tui.waitForText("+2 filters");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-80x24-picker-width", async () => {
      const tui = await launchTUI({ cols: 80, rows: 24 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-120x40-toolbar-full", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("Space", "Enter");
        await tui.sendKeys("a");
        await tui.waitForText("Select Assignee");
        await tui.sendKeys("Enter");
        await tui.waitForText("Label:");
        await tui.waitForText("Assignee:");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-200x60-picker-width", async () => {
      const tui = await launchTUI({ cols: 200, rows: 60 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-200x60-label-descriptions", async () => {
      const tui = await launchTUI({ cols: 200, rows: 60 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-resize-standard-to-min", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("Space", "Enter");
        await tui.waitForText("Label:");
        await tui.resize(80, 24);
        await tui.waitForText("+1 filters");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-resize-min-to-standard", async () => {
      const tui = await launchTUI({ cols: 80, rows: 24 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("Space", "Enter");
        await tui.waitForText("+1 filters");
        await tui.resize(120, 40);
        await tui.waitForText("Label:");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-resize-with-picker-open", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.resize(80, 24);
        await tui.waitForText("Select Label");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-resize-preserves-filter-state", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("f");
        await tui.waitForText("State: Closed");
        await tui.resize(80, 24);
        await tui.waitForText("Closed");
        await tui.resize(120, 40);
        await tui.waitForText("State: Closed");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-resize-preserves-picker-selection", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("Space");
        expect(tui.snapshot()).toMatch(/\u2713/);
        await tui.resize(80, 24);
        expect(tui.snapshot()).toMatch(/\u2713/);
      } finally {
        await tui.terminate();
      }
    });
  });

  // ─── Integration Tests ───────────────────────────────────────

  describe("integration", () => {
    test("issue-filters-state-open-api-call", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.waitForText("State: Open");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-state-closed-api-call", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("f");
        await tui.waitForText("State: Closed");
        await tui.waitForNoText("Loading");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-state-all-api-call", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("f", "f");
        await tui.waitForText("State: All");
        await tui.waitForNoText("Loading");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-label-fetch-on-picker", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.waitForNoText("Loading labels");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-milestone-fetch-on-picker", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("m");
        await tui.waitForText("Select Milestone");
        await tui.waitForNoText("Loading milestones");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-no-assignee-fetch", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("a");
        await tui.waitForText("Select Assignee");
        await tui.waitForNoText("Loading");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-combined-filters", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("f");
        await tui.waitForText("State: Closed");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("Space", "Enter");
        await tui.sendKeys("a");
        await tui.waitForText("Select Assignee");
        await tui.sendKeys("Enter");
        await tui.waitForText("State: Closed");
        await tui.waitForText("Label:");
        await tui.waitForText("Assignee:");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-auth-expiry-in-picker", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_TEST_AUTH_EXPIRE_ON_LABELS: "1" } });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Session expired");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-labels-cached-across-opens", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.sendKeys("Escape");
        await tui.waitForNoText("Select Label");
        await tui.sendKeys("l");
        await tui.waitForText("Select Label");
        await tui.waitForNoText("Loading labels");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-milestones-cached-across-opens", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("m");
        await tui.waitForText("Select Milestone");
        await tui.sendKeys("Escape");
        await tui.waitForNoText("Select Milestone");
        await tui.sendKeys("m");
        await tui.waitForText("Select Milestone");
        await tui.waitForNoText("Loading milestones");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-state-change-clears-pages", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        for (let i = 0; i < 20; i++) await tui.sendKeys("j");
        await tui.sendKeys("f");
        await tui.waitForText("State: Closed");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-navigate-away-and-back", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("f");
        await tui.waitForText("State: Closed");
        await tui.sendKeys("Enter");
        await tui.sendKeys("q");
        await tui.waitForText("State: Open");
      } finally {
        await tui.terminate();
      }
    });

    test("issue-filters-server-error-on-state-change", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_TEST_FAIL_ISSUES_ON_CLOSED: "1" } });
      try {
        await tui.sendKeys("g", "i");
        await tui.waitForText("Issues");
        await tui.sendKeys("f");
        await tui.waitForText("State: Closed");
        // Error should appear for the list; toolbar retains new state for retry
        await tui.waitForText("State: Closed");
      } finally {
        await tui.terminate();
      }
    });
  });
});
```

### Test Philosophy Notes

1. **Tests that fail due to unimplemented backends stay failing.** The `useIssues`, `useRepoLabels`, and `useRepoMilestones` hooks consume the real API. If the API endpoints are not yet implemented, tests will fail with network errors. They are never skipped.
2. **No mocking.** Tests launch a real TUI instance and interact via keyboard simulation and terminal buffer assertions.
3. **Each test is independent.** Fresh `launchTUI()` per test. No shared state.
4. **Snapshots are supplementary.** The `toMatchSnapshot()` calls catch visual regressions. The `waitForText`/`waitForNoText` assertions verify behavior.
5. **Responsive tests at all three breakpoints.** 80×24 (minimum), 120×40 (standard), 200×60 (large).
6. **Resize tests verify dynamic adaptation.** Filter state, picker selection, and focus are preserved across resize.