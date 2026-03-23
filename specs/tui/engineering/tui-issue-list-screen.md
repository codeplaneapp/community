## Implementation Plan

### Phase 1: Screen Scaffolding & State Initialization
**Target File:** `apps/tui/src/screens/issues/IssueListScreen.tsx`
1.  **Imports & Context Setup:**
    *   Import React hooks (`useState`, `useCallback`, `useMemo`).
    *   Import layout/theme hooks: `useTheme`, `useLayout` from TUI context.
    *   Import navigation: `useNavigation` to handle push (`issue-detail`, `issue-create`) and pop (`q`).
    *   Import context: `useRepoContext` to extract `owner` and `repo`.
2.  **Filter State Management:**
    *   Initialize local state for filters: `stateFilter` (default: `'open'`), `labelFilter` (Set of strings), `assigneeFilter` (string | null), `searchQuery` (string).
    *   Initialize overlay visibility state: `isLabelOverlayOpen`, `isAssigneeOverlayOpen`.
3.  **Basic Layout Structure:**
    *   Render a vertical `<box>` taking up `100%` width and height.
    *   Render the title row: `Issues (loading...)`.
    *   Add placeholders for `<FilterToolbar />` and `<ScrollableList />`.

### Phase 2: Data Hooks Integration
**Target File:** `apps/tui/src/screens/issues/IssueListScreen.tsx`
1.  **Fetch Issues:**
    *   Integrate `useIssues(owner, repo, { state: stateFilter, labels: Array.from(labelFilter), assignee: assigneeFilter })` from `@codeplane/ui-core`.
    *   Extract `issues`, `isLoading`, `error`, `hasMore`, `totalCount`, `fetchMore`, `refetch`.
2.  **Client-side Search:**
    *   Memoize the issues list, applying a client-side substring match against `searchQuery` on the issue title.
3.  **Mutations (Optimistic Update):**
    *   Setup `useOptimisticMutation` for toggling issue state (`PATCH /api/repos/:owner/:repo/issues/:number`).
    *   Map `onOptimistic` to locally invert the issue state and `onRevert` to reset it. On error, dispatch an inline error message via status bar.

### Phase 3: Component Implementation
**Target File:** `apps/tui/src/screens/issues/components/FilterToolbar.tsx`
1.  **Toolbar Layout:**
    *   Horizontal `<box>` showing active filters.
    *   Display: `State: Open | Labels: bug, ux | Assignee: —`.
    *   Embed OpenTUI's `<input>` component aligned right for search when `/` is pressed.

**Target File:** `apps/tui/src/screens/issues/components/IssueRow.tsx`
1.  **Responsive Layout Calculations:**
    *   Accept `breakpoint` prop (`minimum`, `standard`, `large`).
    *   `minimum` (80x24): Render state icon (2ch), number (6ch), truncated title (remaining width), timestamp (4ch).
    *   `standard` (120x40): Include label badges (max 20ch width, `+N` overflow), assignee login (12ch max), comment count (5ch).
    *   `large` (200x60): Extend label space, add milestone (15ch).
2.  **Visual Styling:**
    *   Use `useTheme` for semantic colors.
    *   State icons: Green (ANSI 34) ● for open, Red (ANSI 196) ● for closed.
    *   Highlight row if `focused` prop is true (use `theme.primary` for background / reverse video).
    *   Truncate text natively with `…` respecting column constraints.

### Phase 4: Overlays Implementation
**Target File:** `apps/tui/src/screens/issues/components/LabelOverlay.tsx`
1.  **Label Multi-select Modal:**
    *   Use `<ModalSystem>` standard overlay (50% x 60%).
    *   Fetch labels via `useRepoLabels(owner, repo)`.
    *   Render a scrollable list of labels with `[✓]` or `[ ]` checkboxes.
    *   Map `Space` to toggle, `Enter` to apply/close, `Esc` to close without saving.

**Target File:** `apps/tui/src/screens/issues/components/AssigneeOverlay.tsx`
1.  **Assignee Single-select Modal:**
    *   Standard overlay (40% x 50%).
    *   Fetch via `useRepoCollaborators(owner, repo)`.
    *   List options: "All", "Unassigned", and individual collaborators.
    *   Map `Enter` to select/close, `Esc` to cancel.

### Phase 5: Keybinding Registration
**Target File:** `apps/tui/src/screens/issues/IssueListScreen.tsx`
1.  **Register Keybindings:** Use `useScreenKeybindings` to register local shortcuts:
    *   `f`: Cycle `stateFilter` (open -> closed -> all).
    *   `L`: Set `isLabelOverlayOpen(true)`.
    *   `a`: Set `isAssigneeOverlayOpen(true)`.
    *   `c`: Call `push('issue-create', { repo: context.repo })`.
    *   `x`: Trigger optimistic state mutation for the currently focused issue in the `<ScrollableList>`.
    *   `/`: Focus the `<input>` ref in the `FilterToolbar`.
    *   `Enter`: Call `push('issue-detail', { repo: context.repo, number: focusedIssue.number })`.
    *   `q` / `Esc`: `pop()` screen (if not in input or overlay).
2.  **Navigation Wiring:** Pass down `j`, `k`, `Ctrl+D`, `Ctrl+U`, `G`, `gg` directly to `<ScrollableList>`.

---

## Unit & Integration Tests

**Target File:** `e2e/tui/issues.test.ts`

### Terminal Snapshot Tests
Use `@microsoft/tui-test` `launchTUI()` function to mock terminal environment and assert layout regressions.
1.  **`SNAP-ISSUES-001`**: Launch terminal at 120x40. Preload fixtures with 5 open issues, 2 closed issues. Navigate to issues via `g i`. Assert `.toMatchSnapshot()` for standard layout.
2.  **`SNAP-ISSUES-002`**: Resize to 80x24. Verify labels and assignee columns are hidden. Assert snapshot.
3.  **`SNAP-ISSUES-003`**: Resize to 200x60. Verify large column layout including milestones. Assert snapshot.
4.  **`SNAP-ISSUES-006`**: Intercept API to hang. Assert "Loading issues…" spinner with toolbar visible snapshot.
5.  **`SNAP-ISSUES-007`**: Force 500 error from API. Assert red error and "Press R to retry" snapshot.
6.  **`SNAP-ISSUES-008..014`**: Validate focused row rendering, state icons (● green/red), label badge rendering (with +N overflow), assignee formatting, and comment counts.

### Keyboard Interaction Tests
1.  **`KEY-ISSUES-001..006`**: Test `j`, `k`, `Down`, `Up`. Send `j` three times. Use `expect(terminal.getLine(row)).toMatch(/.*\x1b\[7m.*/)` to verify the focus moves exactly 3 items down.
2.  **`KEY-ISSUES-007..008`**: Focus an issue, press `Enter`. Assert the breadcrumb changes to `Dashboard > owner/repo > Issues > #N`.
3.  **`KEY-ISSUES-009..012`**: Press `/`. Type "login". Assert list narrows to issues with "login" in the title. Press `Esc` to clear search.
4.  **`KEY-ISSUES-022..023`**: Press `f`. Assert state filter in toolbar changes to "Closed". Check network fixture to ensure a new `GET` request was dispatched with `state=closed`.
5.  **`KEY-ISSUES-024..027`**: Press `L` to open Label overlay. Navigate with `j`, press `Space` to toggle label. Press `Enter`. Verify toolbar updates with new label filter.
6.  **`KEY-ISSUES-031`**: Press `c`. Assert navigation pushes `issue-create` screen.
7.  **`KEY-ISSUES-032..035`**: Press `x` on open issue. Assert row icon updates to Red ● instantly (optimistic). Simulate 403 API response; assert row icon reverts to Green ● and status bar shows error.
8.  **`KEY-ISSUES-041`**: Scroll to 80% with `Ctrl+D`. Check if `Loading more...` appears and a pagination network request fires.

### Edge Case & Integration Tests
1.  **`INT-ISSUES-004`**: Load 500 issues (cap). Assert footer reads `Pagination limit reached (500)`. Scroll down and ensure no further fetch occurs.
2.  **`INT-ISSUES-009`**: Rate limit simulation. Send `x` multiple times rapidly. Assert 429 response is handled, showing `Rate limited. Retry in Xs` without crashing.
3.  **`INT-ISSUES-018`**: Verify robust parsing of null fields. Issues with missing labels, assignees, or null bodies shouldn't print "null" or crash the `<text>` renderer.
4.  **`EDGE-ISSUES-002`**: Render issue with title exceeding terminal width (e.g., 200 character string with emojis). Assert proper truncation utilizing OpenTUI text boundary logic without wrapping to the next line.