# Implementation Plan: TUI Dashboard Quick Actions Bar

This implementation plan details the steps required to implement the `QuickActionsBar` for the TUI Dashboard. It incorporates corrections from the research findings, specifically regarding OpenTUI's `box` border API, router extensions, and go-to mode keybinding priorities.

## Step 1: Extend Router Registry

Add the missing `RepoCreate` route to the application's routing definitions so navigation from the Quick Actions bar does not throw an error.

**File:** `apps/tui/src/router/types.ts`
- Add `RepoCreate = "RepoCreate",` to the `ScreenName` enum.

**File:** `apps/tui/src/router/registry.ts`
- Add the corresponding entry pointing to `PlaceholderScreen`:
```typescript
[ScreenName.RepoCreate]: {
  component: PlaceholderScreen,
  requiresRepo: false,
  requiresOrg: false,
  breadcrumbLabel: () => "Create Repository",
},
```

## Step 2: Define Dashboard Constants

Create the constants file for the Dashboard screen if it doesn't exist. This acts as the configuration source for the Quick Actions bar.

**File:** `apps/tui/src/screens/Dashboard/constants.ts`
- Define the `QuickAction` interface.
- Export the `QUICK_ACTIONS` array mapping keys `c`, `i`, `n`, `s`, and `/`.
- Export `TRANSIENT_MESSAGE_DURATION_MS = 2000`.
- Export `OVERFLOW_HIDE_ORDER = ["/", "s", "i", "n", "c"]`.
- Export `TAB_HINT = { key: "Tab", label: "next panel" }`.

## Step 3: Implement `useQuickActions` Hook

Create the hook to manage navigation, state (transient messages), telemetry, and keybinding definitions. Based on research findings, go-to mode suppression will naturally fall back to `PRIORITY.GOTO` intercepting overlapping keys, so `isGoToModeActive` state tracking is not necessary here.

**File:** `apps/tui/src/screens/Dashboard/hooks/useQuickActions.ts`
- Export `useQuickActions(options)` taking `isInputFocused`, `focusedPanel`, and `onActivateFilter`.
- Access `useNavigation()`, `useOverlay()`, and `useLayout()`.
- Implement a `useCallback` for `isSuppressed` returning `true` if `isInputFocused` or `overlay.isOpen()`.
- Manage `transientMessage` via standard `useState` and a 2000ms `setTimeout` (cleared on unmount).
- Implement handlers (`handleCreateRepo`, `handleCreateIssue`, `handleNotifications`, `handleSearch`, `handleFilter`).
- Include telemetry calls `emit("tui.dashboard.quick_action.invoked", {...})` and `logger` outputs.
- Return the `keybindings` array (with `when: () => !isSuppressed()`), `transientMessage`, and `isTransientActive`.

## Step 4: Implement `QuickActionsBar` Component

Create the pure rendering component. It receives data via props and handles dynamic rendering and responsive sizing based on terminal width.

**File:** `apps/tui/src/screens/Dashboard/components/QuickActionsBar.tsx`
- Import `TextAttributes` from `../../../theme/tokens.js` (for `TextAttributes.BOLD` value `1`).
- Implement `computeVisibleActions` using `OVERFLOW_HIDE_ORDER` and `layout.width` to gracefully drop actions at smaller widths.
- **CRITICAL OPEN TUI FIX:** Use `border={["top"]}` instead of `borderTop={true}` on the `<box>` element.
- Use `theme.border` for `borderColor`.
- Use nested `<text>` components rather than ANSI escape codes for formatting. Example:
```tsx
<box flexDirection="row" height={1} width="100%" border={["top"]} borderColor={theme.border}>
  {transientMessage ? (
    <text fg={theme.warning}>{transientMessage}</text>
  ) : (
    visibleActions.map((action, idx) => (
      <React.Fragment key={action.key}>
        <text attributes={TextAttributes.BOLD}>{action.key}</text>
        <text fg={theme.muted}>:{label}</text>
        {/* Add separator ... */}
      </React.Fragment>
    ))
  )}
</box>
```
- Emit visibility telemetry `tui.dashboard.quick_action.visible_count` on mount/resize.

## Step 5: Integrate into `DashboardScreen`

Wire the components together in the main Dashboard screen.

**File:** `apps/tui/src/screens/Dashboard/index.tsx`
- Ensure the file exists (create it if stubbed by `tui-dashboard-screen`).
- Import and call `useQuickActions`.
- Merge quick action keybindings with panel keybindings: `const allKeybindings = [...panelKeybindings, ...quickActions.keybindings]`.
- Pass `allKeybindings` to `useScreenKeybindings(allKeybindings, statusBarHints)`.
- Append `<QuickActionsBar transientMessage={quickActions.transientMessage} isCompact={isCompact} />` as the final child of the Dashboard content's main vertical `<box>`.

## Step 6: End-to-End Tests

Implement the comprehensive E2E test suite to validate functionality and visual regressions. 

**File:** `e2e/tui/dashboard.test.ts`
- Scaffold the test file using `@microsoft/tui-test` and `launchTUI` from `helpers.ts`.
- Implement Snapshot Tests (SNAP-QA-001 through SNAP-QA-008) validating standard, compact, large width layouts, and border/transient states.
- Implement Keyboard Interaction Tests (KEY-QA-001 through KEY-QA-016) validating navigation, suppression states, and modal interception.
- Implement Responsive Tests (RESP-QA-001 through RESP-QA-007) ensuring rapid resizes and threshold triggers work without throwing errors.
- Implement Integration Tests (INT-QA-001 through INT-QA-008) ensuring navigation persistence and state isolation.

*Note: Tests relying on backend components that are unimplemented should still be written exactly as described in the spec and allowed to fail, per standard project directives.*