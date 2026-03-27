# Implementation Plan: Repository Tab Navigation (TUI)

Based on the engineering specification and research findings, the implementation must first address the missing dependencies before integrating the full tab navigation system.

## Phase 1: Scaffold Missing Dependencies
Research indicates that the prerequisite artifacts from `tui-repo-tab-bar-component` and `tui-repo-screen-scaffold` do not exist yet. Minimal scaffolds must be created to unblock the integration.

1. **Create Types and Constants**
   - **Files:** `apps/tui/src/types/tab.ts`, `apps/tui/src/constants/repo-tabs.ts`
   - Define `TabDefinition`, `TabSwitchMethod`, `REPO_TABS`, and `DEFAULT_TAB_INDEX`.

2. **Create TabBar Component**
   - **File:** `apps/tui/src/components/TabBar.tsx`
   - Implement the pure presentational component utilizing OpenTUI's `<box>` and `<text>`. Include logic to format labels responsively based on terminal width.

3. **Create Context and Hooks**
   - **Files:** `apps/tui/src/contexts/RepoTabContext.tsx`, `apps/tui/src/hooks/useRepoTab.ts`, `apps/tui/src/hooks/useTabBarKeybindings.ts`
   - Scaffold the global state persistence map and the keybinding logic to handle cycle, jump, and arrow navigation.

4. **Create Screen Scaffolds**
   - **Files:** `apps/tui/src/screens/Repository/RepoHeader.tsx`, `apps/tui/src/screens/Repository/tabs/PlaceholderTab.tsx`
   - Build simple stubs for the header and placeholder tab contents to render inside the main layout.

## Phase 2: Tab Navigation Integration

1. **Implement Error Boundary**
   - **File:** `apps/tui/src/screens/Repository/TabContentErrorBoundary.tsx`
   - Create a React class component that implements `componentDidCatch`. It will isolate errors inside a specific tab and display a fallback UI with an "R to retry" option.

2. **Implement Telemetry Helper**
   - **File:** `apps/tui/src/screens/Repository/tab-telemetry.ts`
   - Import `emit` from `apps/tui/src/lib/telemetry.ts`.
   - Create functions: `emitTabSwitched`, `emitTabViewed`, and `emitTabError` to standardize analytics.

3. **Build the Main RepoOverviewScreen**
   - **File:** `apps/tui/src/screens/Repository/index.tsx`
   - Combine the scaffolded components. 
   - Define the `TAB_CONTENT` mapping (Bookmarks, Changes, Code, Conflicts, Op Log, Settings).
   - Implement `inputFocused` state to track when an input is active to suppress tab-switching keybindings.
   - Wrap the component tree in `RepoTabProvider` for state persistence and mount `TabBar` between `RepoHeader` and the `TabContentErrorBoundary` wrapped tab content.

## Phase 3: Deep Linking

1. **Wire `--tab` Parameter**
   - **File:** `apps/tui/src/navigation/deepLinks.ts`
   - Update the CLI parser to extract `--tab` or `-t` arguments.
   - Add `tab?: string` to `DeepLinkArgs`.
   - Modify `buildInitialStack` so that if `args["--tab"]` is present, it translates to the correct tab index and populates the `params.initialTab` field for `RepoOverviewScreen`.

## Phase 4: E2E Testing

1. **Create E2E Test Suite**
   - **File:** `e2e/tui/repository.test.ts`
   - Leverage `@microsoft/tui-test` and `launchTUI()` from `e2e/tui/helpers.ts`.
   - Implement the 60 defined tests grouping them into: Tab Bar Rendering, Tab Cycling, Number Jump, Arrow Keys, Keybinding Suppression, Content Area Behavior, Active Tab Persistence, Rapid Input, Responsive Behavior, and Integration.
   - Leave tests that rely on unimplemented features (like API errors on mount or issue create forms) failing, adhering strictly to the testing philosophy.
