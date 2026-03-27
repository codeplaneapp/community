# Implementation Plan: tui-repo-tab-bar-component

## Step 1: Define Types
**File**: `apps/tui/src/types/tab.ts`
- Create a new file defining `TabDefinition`, `TabBarProps`, and `TabSwitchMethod`.
- Ensure `TabBarProps` accommodates `tabs`, `activeIndex`, `onTabChange`, and `suppressInput`.
- **Modify**: `apps/tui/src/types/index.ts` to export all definitions from `./tab.js`.

## Step 2: Define Static Constants
**File**: `apps/tui/src/constants/repo-tabs.ts`
- Define the `REPO_TABS` array (statically frozen) with `id`, `label`, `short`, and `key` for the 6 tabs (Bookmarks, Changes, Code, Conflicts, Op Log, Settings).
- Export `REPO_TAB_COUNT` and `DEFAULT_TAB_INDEX` (0).
- **Modify**: `apps/tui/src/constants/index.ts` to export these new constants.

## Step 3: Implement `RepoTabContext`
**File**: `apps/tui/src/contexts/RepoTabContext.tsx`
- Create the tab state context and its provider.
- Establish a top-level module variable (`const globalTabStateMap = new Map<string, number>();`) to handle session-wide persistence of the tab states per repository, surviving navigation transitions.
- Implement `RepoTabProvider` to initialize from the map, manage React state, and write changes back to the map.
- **Modify**: `apps/tui/src/contexts/index.ts` to export `RepoTabContext` and `RepoTabProvider`.

## Step 4: Implement `useRepoTab` Hook
**File**: `apps/tui/src/hooks/useRepoTab.ts`
- Create a consumer hook that wraps `useContext(RepoTabContext)`.
- Throw a clear error if the hook is called outside a `RepoTabProvider` boundary.
- **Modify**: `apps/tui/src/hooks/index.ts` to export `useRepoTab`.

## Step 5: Implement `useTabBarKeybindings` Hook
**File**: `apps/tui/src/hooks/useTabBarKeybindings.ts`
- Encapsulate keybinding logic leveraging `useScreenKeybindings()` and `useOverlay()`.
- Map keybindings for tab cycling (`tab`, `shift+tab`), direct jumps (`1-6`), and arrow navigation (`h/l`, `Left/Right`).
- Implement the suppression logic via a `canSwitch` predicate (checks if `inputFocused` is false and `activeOverlay` is null).
- Register status bar hints for `Tab/S-Tab` and `1-6` keys.
- **Modify**: `apps/tui/src/hooks/index.ts` to export `useTabBarKeybindings`.

## Step 6: Build `TabBar` Component
**File**: `apps/tui/src/components/TabBar.tsx`
- Construct the visual UI component wrapping OpenTUI's `<box>` and `<text>` primitives.
- Utilize `useTheme()` for context-aware coloring (`theme.primary` for active, `theme.muted` for inactive).
- Apply `useLayout()` responsive heuristics:
  - Terminals `< 100` columns output abbreviated labels (e.g., `1:Bkmk`).
  - Terminals `>= 100` columns output full labels.
  - Terminals `>= 200` columns expand inter-tab padding to 4 spaces instead of 2.
- **Modify**: `apps/tui/src/components/index.ts` to export `TabBar`.

## Step 7: Wire Context into `RepoOverviewScreen`
**File**: `apps/tui/src/screens/RepoOverview/RepoOverviewScreen.tsx`
- Create the new screen layout scaffolding.
- Render `RepoOverviewContent` as a child of `RepoTabProvider`, utilizing `owner` and `repo` parsed from navigation context.
- Instantiate the `TabBar` and register `useTabBarKeybindings` passing `activeIndex` and `setActiveIndex` obtained from `useRepoTab`.
- Include placeholder `<box>` elements that conditionally render depending on the current `activeIndex`.

## Step 8: Update Screen Registry
**File**: `apps/tui/src/router/registry.ts`
- Update the `RepoOverview` screen config, replacing the existing `PlaceholderScreen` with the newly established `RepoOverviewScreen`.

## Step 9: Define Comprehensive E2E Tests
**File**: `e2e/tui/repository.test.ts`
- Create this test file using `@microsoft/tui-test` and the internal `launchTUI` wrapper.
- Write snapshot and assertion tests targeting:
  1. **Tab Bar Rendering**: Full vs abbreviated label visibility and reverse video active styles.
  2. **Tab Cycling**: Continuous boundary wrapping (`Tab`/`Shift+Tab`).
  3. **Number Key Access**: Fast jumps mapped specifically to `1-6` keys (and verifying `7-9`, `0` are no-ops).
  4. **Arrow Key Navigation**: No-wrap sequential movement using `h/l` and `Left/Right`.
  5. **Input Suppression**: Interaction testing explicitly covering overlay interferences (e.g., `?` help prompt).
  6. **Persistence**: Validating correct tab state restoral after terminal resizing or back-navigation operations.
  7. **Responsive Formatting**: Ensuring valid snapshot matching at predefined `80x24`, `120x40`, and `200x60` breakpoints.