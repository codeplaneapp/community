# Implementation Plan: tui-issue-list-filters

## Overview
Add a persistent filter toolbar to the Codeplane TUI Issue List screen. It supports state, label, assignee, milestone filtering, and sorting, leveraging React 19 + OpenTUI + `@codeplane/ui-core`.

## 1. Type Definitions & Constants
**File:** `apps/tui/src/screens/Issues/filter-types.ts`
Define core state types and layout constraints. Use literal unicode characters for TUI visual separators to ensure straightforward rendering.

```typescript
export type IssueStateFilter = "open" | "closed" | "";
export type IssueSortOrder = "recently-created" | "recently-updated" | "oldest" | "most-commented" | "least-commented";

export interface IssueFilterState {
  stateFilter: IssueStateFilter;
  sortOrder: IssueSortOrder;
  labelFilters: string[];
  assigneeFilter: string | null;
  milestoneFilter: { id: number; title: string } | null;
}

export const DEFAULT_FILTER_STATE: Readonly<IssueFilterState> = {
  stateFilter: "open", sortOrder: "recently-created",
  labelFilters: [], assigneeFilter: null, milestoneFilter: null,
};

export const STATE_CYCLE: readonly IssueStateFilter[] = ["open", "closed", ""];
export const SORT_CYCLE: readonly IssueSortOrder[] = ["recently-created", "recently-updated", "oldest", "most-commented", "least-commented"];
export const FILTER_SEPARATOR = "│";
```

## 2. Filter State Hook
**File:** `apps/tui/src/screens/Issues/useIssueFilters.ts`
Encapsulates all filtering logic, input debouncing, and client-side sorting of the `@codeplane/ui-core` issue models.

```typescript
import { useState, useCallback, useRef } from "react";
import type { Issue } from "@codeplane/ui-core";
import { IssueFilterState, DEFAULT_FILTER_STATE, STATE_CYCLE, SORT_CYCLE } from "./filter-types";

export function useIssueFilters() {
  const [filters, setFilters] = useState<IssueFilterState>(DEFAULT_FILTER_STATE);
  const [debouncedState, setDebouncedState] = useState(DEFAULT_FILTER_STATE.stateFilter);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cycleState = useCallback(() => {
    setFilters(prev => {
      const next = STATE_CYCLE[(STATE_CYCLE.indexOf(prev.stateFilter) + 1) % STATE_CYCLE.length];
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => setDebouncedState(next), 150);
      return { ...prev, stateFilter: next };
    });
  }, []);

  const applyClientFilters = useCallback((issues: Issue[]) => {
    // Implementation to filter issues by selected label, assignee, milestone
    // and sort according to filters.sortOrder
    return issues;
  }, [filters]);

  return { filters, debouncedState, cycleState, applyClientFilters };
}
```

## 3. Persistent Filter Toolbar Component
**File:** `apps/tui/src/screens/Issues/FilterToolbar.tsx`
An OpenTUI `box` component providing at-a-glance feedback on current filter application, adapting layout based on the terminal breakpoint.

```tsx
import React from "react";
import { useLayout } from "../../hooks/useLayout";
import { useTheme } from "../../theme/useTheme";
import { FILTER_SEPARATOR } from "./filter-types";

export function FilterToolbar({ filters }) {
  const { breakpoint } = useLayout();
  const theme = useTheme();

  return (
    <box flexDirection="row" height={1} width="100%">
      <text>State: <text fg={theme.primary}>{filters.stateFilter || "All"}</text></text>
      {/* Conditionally render Labels, Assignee, Milestone separated by FILTER_SEPARATOR */}
    </box>
  );
}
```

## 4. Overlay Picker for Selectors
**File:** `apps/tui/src/screens/Issues/FilterPicker.tsx`
A flexible `<scrollbox>` modal taking priority keybindings (`j`/`k`/`Enter`/`Space`) to facilitate multi-select operations for filters like labels.

```tsx
import React, { useState } from "react";
import { useTheme } from "../../theme/useTheme";

export function FilterPicker({ title, items, onConfirm, onDismiss }) {
  const theme = useTheme();
  return (
    <box position="absolute" top="center" left="center" width="60%" height="60%" borderStyle="single" borderColor={theme.border}>
      <scrollbox scrollY>
        {/* Iteration of picker options handling active focus styling */}
      </scrollbox>
    </box>
  );
}
```

## 5. Main Issues Screen Integration
**File:** `apps/tui/src/screens/Issues/IssuesScreen.tsx`
Integrates core data fetching from `@codeplane/ui-core`, renders the toolbar, manages keyboard commands via hooks, and maps the final `filteredIssues` set to OpenTUI components.

```tsx
import React from "react";
import { useIssues } from "@codeplane/ui-core";
import { useIssueFilters } from "./useIssueFilters";
import { FilterToolbar } from "./FilterToolbar";

export function IssuesScreen({ owner, repo }) {
  const filterContext = useIssueFilters();
  const { data, isLoading } = useIssues(owner, repo, { state: filterContext.debouncedState });
  
  const filteredIssues = filterContext.applyClientFilters(data || []);

  return (
    <box flexDirection="column" width="100%" height="100%">
      <FilterToolbar filters={filterContext.filters} />
      <scrollbox flexGrow={1} scrollY>
         {/* Map over filteredIssues creating IssueRows */}
      </scrollbox>
      {/* Conditionally render <FilterPicker> if active */}
    </box>
  );
}
```

## 6. Update Router Registry
**File:** `apps/tui/src/router/registry.ts`
Locate the existing `ScreenName.Issues` configuration. Replace `PlaceholderScreen` with the newly created `IssuesScreen` component.

## 7. E2E Validation
**File:** `e2e/tui/issues.test.ts`
Build structural testing utilizing `@microsoft/tui-test` to mimic user actions over `launchTUI()`.
- **Snapshots**: Verify visual layout matches designs for default, `open`, `closed`, and nested picker overlay states.
- **Interactions**: 
  - Emulate keypress `f` mapping state from open -> closed -> all.
  - Verify `o` toggles through expected data sort routines.
  - Confirm modal scopes appropriately trap `<FilterPicker>` `j`/`k` and `Space` commands out of the core screen listener.
- **Constraint Checks**: Ensure all tests invoking unimplemented `@codeplane/ui-core` API responses are explicitly written and permitted to fail, respecting the strict TUI PRD guidelines.