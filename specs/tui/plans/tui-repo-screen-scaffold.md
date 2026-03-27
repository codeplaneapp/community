# Implementation Plan: tui-repo-screen-scaffold

This implementation plan addresses the `tui-repo-screen-scaffold` ticket to provide the main structure and tab routing for the Repository overview screen in the Codeplane TUI. It includes stubbing missing functionality based on the research findings.

## 1. Setup Utilities and Stubs

### 1.1 Implement formatting utility
**File:** `apps/tui/src/util/format.ts`
- Check if `formatCompactNumber` exists. If not, add the following implementation:
```typescript
/**
 * Format a number into a compact string representation (e.g., 1.2k, 3.5M).
 */
export function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  }
  return num.toString();
}
```

### 1.2 Stub `Repository` type
**File:** `apps/tui/src/hooks/data/types.ts` (create if it doesn't exist)
- Add the `Repository` type interface:
```typescript
export interface Repository {
  fullName: string;
  isPrivate: boolean;
  isArchived?: boolean;
  numStars: number;
  numForks: number;
  numWatches: number;
  numIssues: number;
  description?: string;
}
```

### 1.3 Stub `useRepo` hook
**File:** `apps/tui/src/hooks/data/useRepo.ts` (create if it doesn't exist)
- Implement a mock version of `useRepo` since `tui-repo-data-hooks` is not yet available:
```typescript
import { useState, useEffect } from "react";
import type { Repository } from "./types.js";

// STUB: Replace with import from @codeplane/ui-core when tui-repo-data-hooks ships
export function useRepo(owner: string, repo: string) {
  const [data, setData] = useState<Repository | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => {
      if (repo.includes("404")) {
        setError({ message: "Not found", status: 404 });
        setIsLoading(false);
        return;
      }
      setData({
        fullName: `${owner}/${repo}`,
        isPrivate: false,
        isArchived: false,
        numStars: 42,
        numForks: 7,
        numWatches: 12,
        numIssues: 23,
        description: "A temporary repository stub for testing.",
      });
      setIsLoading(false);
    }, 100);
    return () => clearTimeout(timer);
  }, [owner, repo]);

  return { repo: data, isLoading, error, refetch: () => {} };
}
```

## 2. Scaffold Repository Screen Structure

### 2.1 Shared Types
**File:** `apps/tui/src/screens/Repository/types.ts`
- Create shared interfaces: `RepoTab`, `RepoHeaderProps`, `RepoContextValue`.

### 2.2 RepoContext
**File:** `apps/tui/src/screens/Repository/RepoContext.tsx`
- Create the `RepoContext` React context.
- Export `RepoContextProvider` wrapper and `useRepoContext()` custom hook (which throws if accessed outside the provider).

### 2.3 RepoHeader Component
**File:** `apps/tui/src/screens/Repository/RepoHeader.tsx`
- Implement the fixed-height repository metadata header section.
- Use `useTheme` and `useLayout`.
- Include row 1: name, visibility badge, archive badge.
- Include row 2: stars, forks, watchers (hidden on minimum breakpoint), issues.
- Include row 3: truncated description (hidden on minimum breakpoint).

### 2.4 Placeholder Tab Component
**File:** `apps/tui/src/screens/Repository/tabs/PlaceholderTab.tsx`
- Create a generic component rendering centered muted text: `{tabName} — not yet implemented`.

### 2.5 Tab Configuration
**File:** `apps/tui/src/screens/Repository/tabs/index.ts`
- Export the `REPO_TABS` array defining 6 tabs (Bookmarks, Changes, Code, Conflicts, Op Log, Settings).
- Wire up each tab's component to `PlaceholderTab` with its respective label.

## 3. Implement RepoOverviewScreen

### 3.1 Main Screen Component
**File:** `apps/tui/src/screens/Repository/index.tsx`
- Create the primary `RepoOverviewScreen`.
- Fetch `owner` and `repoName` from `params` or fallback to `repoContext`.
- Invoke the `useRepo` hook.
- Manage loading state with `useScreenLoading`, rendering `<SkeletonDetail>` or `<FullScreenLoading>` as appropriate.
- Handle errors using `<FullScreenError>`.
- Register keybindings with `useScreenKeybindings` (`R` to retry, `s` for star/unstar placeholder, `Tab` and `1-6` hints).
- Maintain local state for `activeTabIndex`.
- Embed the `InlineTabBar` defined in the design specification as a fallback until the standalone TabBar component is complete.
- Render `<RepoContextProvider>`, `<RepoHeader>`, `InlineTabBar`, and dynamically the active tab content component in a flex box.

## 4. Router and Barrel Integrations

### 4.1 Update Screen Barrel Export
**File:** `apps/tui/src/screens/index.ts`
- Add exports:
  ```typescript
  export { RepoOverviewScreen } from "./Repository/index.js";
  export { useRepoContext, RepoContextProvider } from "./Repository/RepoContext.js";
  ```

### 4.2 Update Screen Registry
**File:** `apps/tui/src/router/registry.ts`
- Update `ScreenName.RepoOverview` mapping to point to `RepoOverviewScreen` instead of `PlaceholderScreen`.

## 5. E2E Testing

### 5.1 Repository Detail E2E Tests
**File:** `e2e/tui/repository.test.ts`
- Create the test suite with `@microsoft/tui-test` launching the TUI via `launchTUI()`.
- Write tests for:
  - The scaffold correctly extracting `owner/repo` and reflecting it in the breadcrumb and header.
  - Visibility badge display.
  - Star and fork count display.
  - Error state handling with the `404` mock repo.
  - Tab bar rendering 6 tabs with numeric prefixes.
  - `Tab` key cycling to the next tab.
  - `Shift+Tab` cycling to the previous tab.
  - `1-6` number key navigation directly to tabs.
  - Unmounting and remounting tab content on tab switch.
  - Back navigation using `q`.
  - Responsive layout (minimum breakpoint hiding watchers and description, truncating tab labels).
  - Proper context accessibility (tab content rendering proves it's mounted inside `RepoContext`).
  - Status bar hint displays for tabs and starring.
