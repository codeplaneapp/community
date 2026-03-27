# Engineering Specification: TUI_REPO_TAB_NAVIGATION

## Overview
This specification outlines the technical implementation for the 6-tab navigation system within the Codeplane TUI repository detail screen. It relies on the pre-existing `<TabBar>` component and the `RepoScreenScaffold`.

## Implementation Plan

### 1. Types and Constants (`apps/tui/src/features/repository/tabs.ts`)
- Define a union type `RepoTabId = "bookmarks" | "changes" | "code" | "conflicts" | "oplog" | "settings"`.
- Export a constant `REPO_TABS` array containing the definition for each of the 6 tabs:
  ```typescript
  export const REPO_TABS = [
    { id: "bookmarks", label: "Bookmarks", short: "Bkmk", key: "1" },
    { id: "changes", label: "Changes", short: "Chng", key: "2" },
    { id: "code", label: "Code", short: "Code", key: "3" },
    { id: "conflicts", label: "Conflicts", short: "Cnfl", key: "4" },
    { id: "oplog", label: "Op Log", short: "OpLg", key: "5" },
    { id: "settings", label: "Settings", short: "Sett", key: "6" },
  ] as const;
  ```

### 2. State Management Hook (`apps/tui/src/features/repository/useRepoTabs.ts`)
- Create a custom hook `useRepoTabs(repoId: string)` to manage the active tab index.
- **Persistence**: Store the active tab index in the `NavigationContext` (or an equivalent session-scoped cache keyed by `repoId`). When navigating back to a previously visited repository, restore its `activeIndex`. Defaults to `0` (Bookmarks).
- Expose `activeIndex` and a setter `setActiveIndex(index: number)` that enforces the `0-5` clamping range.

### 3. Keybindings Integration (`apps/tui/src/features/repository/useRepoTabKeybindings.ts`)
- Utilize `useScreenKeybindings` to register tab switching keys at the screen priority level.
- Implement the following key handlers:
  - `Tab`: `setActiveIndex((prev) => (prev + 1) % 6)`
  - `Shift+Tab`: `setActiveIndex((prev) => (prev + 5) % 6)`
  - `1` through `6`: `setActiveIndex(parseInt(key) - 1)`
  - `l` / `Right`: `setActiveIndex((prev) => Math.min(prev + 1, 5))`
  - `h` / `Left`: `setActiveIndex((prev) => Math.max(prev - 1, 0))`
- The OpenTUI priority stack will inherently suppress these keys when `<input>` / `<textarea>` components or overlays/modals capture focus (Priorities 1 & 2).

### 4. Layout & Rendering Components

#### `RepoTabBar.tsx` (`apps/tui/src/features/repository/RepoTabBar.tsx`)
- Consume `useTerminalDimensions` to ascertain terminal width.
- Implement a `formatTabLabel` utility:
  - If `< 100` columns: return `${key}:${short}` (e.g., `1:Bkmk`).
  - If `>= 100` columns: return `${key}:${label}` (e.g., `1:Bookmarks`).
- Pass calculated spacing (2 spaces if `< 200` width, 4 spaces if `>= 200` width) and the formatted labels to the underlying `<TabBar>` dependency component.
- The `<TabBar>` applies `primary` color, reverse-video, and underline styling to the currently active index.

#### `RepoTabContent.tsx` (`apps/tui/src/features/repository/RepoTabContent.tsx`)
- Wrap the content area in a flex-growing container: `<scrollbox flexGrow={1}>`
- Use a `switch (activeIndex)` to render the correct child component:
  - `0`: `<BookmarksView repo={repo} />`
  - `1`: `<ChangesView repo={repo} />`
  - `2`: `<CodeExplorerView repo={repo} />`
  - `3`: `<ConflictsView repo={repo} />`
  - `4`: `<OperationLogView repo={repo} />`
  - `5`: `<SettingsView repo={repo} />`
- Wrap the child payload in an `<ErrorBoundary>`. If a specific tab content fails to load, the error renders inline, allowing the user to seamlessly switch to other tabs without losing screen context.

### 5. Wiring into `RepoOverviewScreen.tsx` (`apps/tui/src/screens/repository/RepoOverviewScreen.tsx`)
- Combine `<RepoHeader>`, `<RepoTabBar>`, and `<RepoTabContent>` in a vertical stack (`<box flexDirection="column" height="100%">`).
- Extract the `repo.id` from `useRepo()` or route params, passing it down to `useRepoTabs` to initialize tab state seamlessly.

## Unit & Integration Tests

### Testing Strategy
All verification is to be implemented using `@microsoft/tui-test`. Code will reside in `e2e/tui/repository.test.ts`.

### 1. Terminal Snapshot Tests
- **`repo-tab-bar-default-state`**: Render at 120x40. Verify 6 tabs exist, Bookmarks is active (reverse video), others are muted.
- **`repo-tab-bar-{tab}-active`**: Simulate keys `2` through `6`, capturing snapshots of respective tabs actively styled while corresponding content renders.
- **Responsive Formatting**:
  - `repo-tab-bar-abbreviated-80col`: Snapshot at 80x24. Verify `1:Bkmk` abbreviations.
  - `repo-tab-bar-full-labels-120col`: Snapshot at 120x40. Verify `1:Bookmarks` normal format.
  - `repo-tab-bar-expanded-200col`: Snapshot at 200x60. Verify full labels with a 4-space gap.

### 2. Keyboard Interaction Tests
- **Cycling**: Trigger `repo-tab-cycle-forward` (`Tab`) and `repo-tab-cycle-backward` (`Shift+Tab`). Validate wrapping behavior explicitly (e.g., Bookmarks -> Settings).
- **Jumping**: Trigger keys `1` through `6`. Ensure `7`, `8`, `9`, `0` do not trigger re-renders.
- **Arrow Nav**: Trigger `h`/`Left` and `l`/`Right`. Validate they halt at extremes and do *not* wrap.
- **Focus Suppression**: Activate a text input or open the command palette (`:`). Trigger `3` and `Tab`. Assert input receives characters/advances while the tab activeIndex stays unchanged.

### 3. State & Persistence Tests
- **Session Persistence**: Navigate to tab 3 (Code). Hit `q` to pop back to the list screen. Select the exact same repository. Assert tab 3 renders active.
- **Context Swap Reset**: Navigate to tab 4 on Repo A. Hit `q`. Enter Repo B. Assert tab gracefully resets to index 0 (Bookmarks).
- **Resize Preservation**: Simulate terminal resize from 120x40 to 80x24 while viewing tab 5 (Op Log). Assert tab 5 remains active while the labels correctly truncate.

### 4. Edge Cases and Error Recoveries
- **Fetch Failures**: Force an API `500` error mocking a Code Explorer failure. Assert the inline error text renders locally within `<RepoTabContent>` while `<RepoTabBar>` remains intact and navigable.